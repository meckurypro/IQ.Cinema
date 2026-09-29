-- Settings, notifications and language (English/French) ---------------------------------
-- Applied to the live project as "settings_notifications_i18n".

-- 1. Languages (admin-editable, read by the client to build the picker) -------------------
create table if not exists public.app_languages (
  code         text primary key check (code ~ '^[a-z]{2,3}$'),
  label        text not null,
  native_label text not null,
  enabled      boolean not null default true,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);
alter table public.app_languages enable row level security;
drop policy if exists app_languages_select_all on public.app_languages;
drop policy if exists app_languages_admin_write on public.app_languages;
create policy app_languages_select_all on public.app_languages for select using (true);
create policy app_languages_admin_write on public.app_languages for all using (is_admin()) with check (is_admin());
drop trigger if exists trg_app_languages_updated_at on public.app_languages;
create trigger trg_app_languages_updated_at before update on public.app_languages
  for each row execute function public.set_updated_at();

insert into public.app_languages (code, label, native_label, sort_order) values
  ('en', 'English', 'English', 10),
  ('fr', 'French',  'Français', 20)
on conflict (code) do nothing;

-- Any language outside the supported list falls back to English before the FK is added.
update public.user_settings set language = 'en' where language not in (select code from public.app_languages);
alter table public.user_settings drop constraint if exists user_settings_language_fkey;
alter table public.user_settings
  add constraint user_settings_language_fkey foreign key (language) references public.app_languages (code) on update cascade;

-- 2. Admin on/off switches for each Settings section --------------------------------------
insert into public.feature_flags (key, label, description, enabled) values
  ('settings_appearance',    'Settings: Appearance',    'Shows the light / dark / system picker in Settings', true),
  ('settings_language',      'Settings: Language',      'Shows the language picker in Settings',               true),
  ('settings_playback',      'Settings: Playback',      'Shows the autoplay-next-episode toggle in Settings',  true),
  ('settings_notifications', 'Settings: Notifications', 'Shows the notification toggles in Settings',         true),
  ('settings_whatsapp',      'Settings: WhatsApp',      'Shows the WhatsApp link row in Settings',             true)
on conflict (key) do nothing;

-- 3. Every user gets a real settings row (so defaults live in the DB, not just the UI) ------
insert into public.user_settings (user_id) select id from public.profiles on conflict (user_id) do nothing;

create or replace function public.create_user_settings_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_profiles_create_settings on public.profiles;
create trigger trg_profiles_create_settings after insert on public.profiles
  for each row execute function public.create_user_settings_row();

-- 4. WhatsApp number can only be written by link_whatsapp() (validated + unique), never directly ----
create or replace function public.user_settings_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.whatsapp_number := null;
      new.whatsapp_linked_at := null;
    else
      new.whatsapp_number := old.whatsapp_number;
      new.whatsapp_linked_at := old.whatsapp_linked_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_user_settings_guard on public.user_settings;
create trigger trg_user_settings_guard before insert or update on public.user_settings
  for each row execute function public.user_settings_guard();

-- 5. Notifications that honour the toggles ------------------------------------------------
-- 5a. New episode -> followers (watchlist + saved episodes) with notify_new_episodes on
create or replace function public.notify_new_episode()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title record;
begin
  if new.status::text <> 'published' or coalesce(new.is_promo, false) or new.episode_number < 2 then return new; end if;
  if tg_op = 'UPDATE' and old.status::text = 'published' then return new; end if;
  select id, title, slug, status into v_title from public.titles where id = new.title_id;
  if v_title.status::text is distinct from 'published' then return new; end if;

  insert into public.notifications (user_id, type, title, body, metadata)
  select f.user_id, 'new_episode', v_title.title || ': new episode',
         'Episode ' || new.episode_number || ' just dropped.',
         jsonb_build_object('title_id', v_title.id, 'slug', v_title.slug, 'episode_id', new.id, 'href', '/title/' || v_title.slug)
    from (
      select w.user_id from public.watchlist w where w.title_id = new.title_id
      union
      select s.user_id from public.episode_saves s join public.episodes e on e.id = s.episode_id where e.title_id = new.title_id
    ) f
    left join public.user_settings us on us.user_id = f.user_id
   where coalesce(us.notify_new_episodes, true)
     and not exists (
       select 1 from public.notifications n
        where n.user_id = f.user_id and n.type = 'new_episode'
          and n.metadata->>'title_id' = v_title.id::text
          and n.created_at > now() - interval '6 hours');
  return new;
end $$;
drop trigger if exists trg_episodes_notify_new on public.episodes;
create trigger trg_episodes_notify_new after insert or update of status on public.episodes
  for each row execute function public.notify_new_episode();

-- 5b. Daily check-in reminder (cron) -> users with notify_rewards on who haven't checked in today
create or replace function public.send_reward_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := reward_today(); v_n integer;
begin
  insert into public.notifications (user_id, type, title, body, metadata)
  select p.id, 'reward_reminder', 'Your daily check-in is ready',
         'Check in today to keep your streak going and earn coins.',
         jsonb_build_object('href', '/rewards', 'day', v_today::text)
    from public.profiles p
    left join public.user_settings us on us.user_id = p.id
   where coalesce(us.notify_rewards, true)
     and not exists (select 1 from public.check_ins c where c.user_id = p.id and c.day = v_today)
     and not exists (select 1 from public.notifications n
                      where n.user_id = p.id and n.type = 'reward_reminder' and n.metadata->>'day' = v_today::text);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.send_reward_reminders() from public, anon, authenticated;

-- 5c. Promotions (admin-triggered) -> only users who opted in (notify_promos)
create or replace function public.admin_send_promo(p_title text, p_body text default null, p_href text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'title_required'; end if;
  if p_href is not null and p_href !~ '^/' then raise exception 'href_must_be_in_app_path'; end if;
  insert into public.notifications (user_id, type, title, body, metadata)
  select us.user_id, 'promo', btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''),
         case when p_href is null then '{}'::jsonb else jsonb_build_object('href', p_href) end
    from public.user_settings us
   where us.notify_promos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.admin_send_promo(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_send_promo(text, text, text) to authenticated;

-- 6. Cron: 18:00 Lagos (17:00 UTC) daily ---------------------------------------------------
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('daily-reward-reminders'); exception when others then null; end $$;
select cron.schedule('daily-reward-reminders', '0 17 * * *', $cron$select public.send_reward_reminders()$cron$);
