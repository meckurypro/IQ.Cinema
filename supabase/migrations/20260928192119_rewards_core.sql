-- Rewards core: reward coins + points balances, daily check-in streak, earn tasks,
-- rewarded ads, watch-time heartbeat, daily offers, user settings.
-- Additive. Nothing existing is dropped. The one behaviour change to an existing object is
-- closing notifications_admin_insert, which was `WITH CHECK (is_admin() OR true)` (anyone could
-- insert notifications for anyone). Nothing in the client inserts notifications.

-- 1. Wallet: second balance ("Reward Coins") and Member Points ----------------
alter table public.wallets
  add column if not exists reward_coin_balance bigint not null default 0,
  add column if not exists points_balance bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.wallets'::regclass and conname = 'wallets_reward_coin_balance_check') then
    alter table public.wallets add constraint wallets_reward_coin_balance_check check (reward_coin_balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.wallets'::regclass and conname = 'wallets_points_balance_check') then
    alter table public.wallets add constraint wallets_points_balance_check check (points_balance >= 0);
  end if;
end $$;

-- Economics levers (owner-tunable from /admin/rewards).
alter table public.platform_settings
  add column if not exists reward_coin_creator_share numeric(3,2) not null default 1.00,
  add column if not exists points_box_min integer not null default 50,
  add column if not exists points_box_max integer not null default 1000,
  add column if not exists points_box_vip_only boolean not null default true;

-- 2. Helpers --------------------------------------------------------------------
-- The "reward day" rolls over at midnight Lagos time (WAT, no DST).
create or replace function public.reward_today()
returns date language sql stable
as $$ select (now() at time zone 'Africa/Lagos')::date $$;

create or replace function public.is_vip(p_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from subscriptions s
     where s.user_id = p_user and s.status = 'active' and s.current_period_end > now()
  );
$$;
revoke all on function public.is_vip(uuid) from public, anon, authenticated;

-- 3. User settings ------------------------------------------------------------
create table if not exists public.user_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  language            text not null default 'en' check (language ~ '^[a-z]{2,3}(-[A-Za-z]+)?$'),
  autoplay_next       boolean not null default true,
  notify_new_episodes boolean not null default true,
  notify_rewards      boolean not null default true,
  notify_promos       boolean not null default false,
  push_permission     text not null default 'default' check (push_permission in ('default', 'granted', 'denied')),
  whatsapp_number     text unique,
  whatsapp_linked_at  timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_select_own on public.user_settings for select to authenticated using (auth.uid() = user_id);
create policy user_settings_insert_own on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
create policy user_settings_update_own on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();
revoke all on public.user_settings from anon;

-- 4. Config tables (public read, admin write) -------------------------------------
create table if not exists public.reward_tasks (
  key               text primary key,
  kind              text not null check (kind in ('login','email','whatsapp','notifications','social','watch_time','reserve','ad','checkin_ad')),
  title             text not null,
  description       text,
  reward_coins      integer not null default 0 check (reward_coins >= 0),
  daily_cap         integer check (daily_cap is null or daily_cap > 0),
  threshold_seconds integer check (threshold_seconds is null or threshold_seconds > 0),
  action_url        text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  updated_at        timestamptz not null default now()
);

create table if not exists public.checkin_rewards (
  day_index integer primary key check (day_index between 1 and 7),
  coins     integer not null check (coins >= 0)
);

create table if not exists public.house_ads (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  image_url        text,
  video_url        text,
  cta_label        text,
  cta_url          text,
  duration_seconds integer not null default 15 check (duration_seconds between 5 and 60),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.daily_offers (
  id               uuid primary key default gen_random_uuid(),
  title_id         uuid not null references public.titles (id) on delete cascade,
  discount_percent integer not null check (discount_percent between 1 and 100),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null default ((date_trunc('day', now() at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos'),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists daily_offers_active_idx on public.daily_offers (is_active, starts_at, ends_at);
create index if not exists daily_offers_title_idx on public.daily_offers (title_id);

do $$
declare t text;
begin
  foreach t in array array['reward_tasks','checkin_rewards','house_ads','daily_offers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin_write', t);
  end loop;
end $$;
-- house_ads: the public only needs the ones that are live.
drop policy if exists house_ads_select on public.house_ads;
create policy house_ads_select on public.house_ads for select using (is_active or is_admin());

drop trigger if exists trg_reward_tasks_updated_at on public.reward_tasks;
create trigger trg_reward_tasks_updated_at before update on public.reward_tasks
  for each row execute function public.set_updated_at();

-- 5. Per-user state (written only by the RPCs below) -------------------------------
create table if not exists public.check_ins (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  streak     integer not null,
  coins      integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.reward_claims (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  task_key   text not null references public.reward_tasks (key) on update cascade,
  period     text not null,              -- 'once' or 'YYYY-MM-DD' (reward day)
  ref        text not null default '',   -- e.g. title id, ad view id
  coins      integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_key, period, ref)
);
create index if not exists reward_claims_user_idx on public.reward_claims (user_id, created_at desc);

create table if not exists public.reward_ledger (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  currency   text not null check (currency in ('reward_coins', 'points')),
  amount     bigint not null,            -- signed
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index if not exists reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);

create table if not exists public.daily_watch (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null,
  seconds      integer not null default 0,
  last_beat_at timestamptz,
  primary key (user_id, day)
);

create table if not exists public.reward_visits (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  task_key   text not null references public.reward_tasks (key) on update cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, task_key)
);

create table if not exists public.ad_views (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  task_key     text not null references public.reward_tasks (key) on update cascade,
  house_ad_id  uuid references public.house_ads (id) on delete set null,
  min_seconds  integer not null,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  coins        integer
);
create index if not exists ad_views_user_idx on public.ad_views (user_id, started_at desc);

do $$
declare t text;
begin
  foreach t in array array['check_ins','reward_claims','reward_ledger','daily_watch','reward_visits','ad_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id or is_admin())', t || '_select_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- 6. Internal ledger helper ----------------------------------------------------------
create or replace function public._credit(p_user uuid, p_currency text, p_amount bigint, p_reason text, p_ref text default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  insert into wallets (user_id) values (p_user) on conflict do nothing;
  if p_currency = 'reward_coins' then
    update wallets set reward_coin_balance = reward_coin_balance + p_amount where user_id = p_user;
  elsif p_currency = 'points' then
    update wallets set points_balance = points_balance + p_amount where user_id = p_user;
  else
    raise exception 'unknown currency %', p_currency;
  end if;
  insert into reward_ledger (user_id, currency, amount, reason, ref) values (p_user, p_currency, p_amount, p_reason, p_ref);
end;
$$;
revoke all on function public._credit(uuid, text, bigint, text, text) from public, anon, authenticated;

-- 7. Daily check-in ---------------------------------------------------------------------
create or replace function public.daily_check_in()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_prev integer;
  v_streak integer;
  v_idx integer;
  v_coins integer;
  v_inserted integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  select streak into v_prev from check_ins where user_id = v_uid and day = v_today - 1;
  v_streak := coalesce(v_prev, 0) + 1;
  v_idx := ((v_streak - 1) % 7) + 1;
  select coins into v_coins from checkin_rewards where day_index = v_idx;
  v_coins := coalesce(v_coins, 0);

  insert into check_ins (user_id, day, streak, coins) values (v_uid, v_today, v_streak, v_coins)
  on conflict (user_id, day) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select streak into v_streak from check_ins where user_id = v_uid and day = v_today;
    return jsonb_build_object('ok', true, 'already', true, 'streak', v_streak);
  end if;

  perform _credit(v_uid, 'reward_coins', v_coins, 'daily_check_in', v_today::text);
  return jsonb_build_object('ok', true, 'already', false, 'credited', v_coins, 'streak', v_streak, 'day_index', v_idx);
end;
$$;

-- 8. Watch-time heartbeat: credit can never exceed wall-clock time ------------------------------
create or replace function public.watch_heartbeat(p_episode_id uuid, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_last timestamptz;
  v_elapsed numeric;
  v_credit integer;
  v_total integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_seconds is null or p_seconds < 1 then return jsonb_build_object('ok', false, 'error', 'bad_seconds'); end if;
  if not exists (select 1 from episodes where id = p_episode_id and status = 'published') then
    return jsonb_build_object('ok', false, 'error', 'episode_not_found');
  end if;

  insert into daily_watch (user_id, day, seconds) values (v_uid, v_today, 0) on conflict do nothing;
  select last_beat_at, seconds into v_last, v_total from daily_watch where user_id = v_uid and day = v_today for update;

  v_elapsed := case when v_last is null then 30 else extract(epoch from (now() - v_last)) end;
  if v_elapsed < 5 then
    return jsonb_build_object('ok', true, 'credited', 0, 'seconds', v_total);
  end if;

  v_credit := least(p_seconds, 30, floor(v_elapsed)::integer);
  update daily_watch set seconds = seconds + v_credit, last_beat_at = now()
   where user_id = v_uid and day = v_today
   returning seconds into v_total;
  return jsonb_build_object('ok', true, 'credited', v_credit, 'seconds', v_total);
end;
$$;

-- 9. Link WhatsApp / social visit ---------------------------------------------------------------
create or replace function public.link_whatsapp(p_number text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  v_n := regexp_replace(coalesce(p_number, ''), '[\s\-\(\)\.]', '', 'g');
  if v_n ~ '^0[0-9]{10}$' then v_n := '+234' || substr(v_n, 2);          -- Nigerian local format
  elsif v_n ~ '^234[0-9]{10}$' then v_n := '+' || v_n;
  end if;
  if v_n !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_number');
  end if;

  begin
    insert into user_settings (user_id, whatsapp_number, whatsapp_linked_at) values (v_uid, v_n, now())
    on conflict (user_id) do update set whatsapp_number = excluded.whatsapp_number, whatsapp_linked_at = now();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'number_in_use');
  end;
  return jsonb_build_object('ok', true, 'number', v_n);
end;
$$;

create or replace function public.mark_social_visit(p_task_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from reward_tasks where key = p_task_key and kind = 'social' and is_active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_task');
  end if;
  insert into reward_visits (user_id, task_key) values (v_uid, p_task_key) on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- 10. Generic claim (login / email / whatsapp / notifications / social / watch_time) --------------------
create or replace function public.claim_reward_task(p_task_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_t reward_tasks%rowtype;
  v_period text;
  v_ok boolean := false;
  v_inserted integer;
  v_us user_settings%rowtype;
  v_visit timestamptz;
  v_watch integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_t from reward_tasks where key = p_task_key and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_task'); end if;

  v_period := case when v_t.kind = 'watch_time' then v_today::text else 'once' end;

  case v_t.kind
    when 'login' then v_ok := true;
    when 'email' then
      select (email_confirmed_at is not null) into v_ok from auth.users where id = v_uid;
      if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'error', 'email_not_verified'); end if;
    when 'whatsapp' then
      select * into v_us from user_settings where user_id = v_uid;
      if v_us.whatsapp_number is null then return jsonb_build_object('ok', false, 'error', 'whatsapp_not_linked'); end if;
    when 'notifications' then
      select * into v_us from user_settings where user_id = v_uid;
      if coalesce(v_us.push_permission, 'default') <> 'granted' then return jsonb_build_object('ok', false, 'error', 'permission_not_granted'); end if;
    when 'social' then
      select visited_at into v_visit from reward_visits where user_id = v_uid and task_key = p_task_key;
      if v_visit is null then return jsonb_build_object('ok', false, 'error', 'not_visited'); end if;
      if now() - v_visit < make_interval(secs => coalesce(v_t.threshold_seconds, 8)) then
        return jsonb_build_object('ok', false, 'error', 'too_soon');
      end if;
    when 'watch_time' then
      select seconds into v_watch from daily_watch where user_id = v_uid and day = v_today;
      if coalesce(v_watch, 0) < coalesce(v_t.threshold_seconds, 0) then
        return jsonb_build_object('ok', false, 'error', 'not_enough_watch_time', 'seconds', coalesce(v_watch, 0));
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'not_claimable');   -- reserve / ad kinds pay out elsewhere
  end case;

  insert into reward_claims (user_id, task_key, period, ref, coins)
  values (v_uid, p_task_key, v_period, '', v_t.reward_coins)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('ok', false, 'error', 'already_claimed'); end if;

  perform _credit(v_uid, 'reward_coins', v_t.reward_coins, 'task:' || p_task_key, v_period);
  return jsonb_build_object('ok', true, 'credited', v_t.reward_coins);
end;
$$;

-- 11. Rewarded ads (house ads; an ad network can be plugged in on the client) -----------------------------
create or replace function public.start_ad_view(p_task_key text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_t reward_tasks%rowtype;
  v_ad house_ads%rowtype;
  v_done integer;
  v_id uuid;
  v_enabled boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select coalesce(ads_enabled, false) into v_enabled from platform_settings where id = true;
  select * into v_t from reward_tasks where key = p_task_key and kind in ('ad', 'checkin_ad') and is_active;
  if not found or not v_enabled then return jsonb_build_object('ok', false, 'error', 'ads_unavailable'); end if;

  select count(*) into v_done from reward_claims where user_id = v_uid and task_key = p_task_key and period = v_today::text;
  if v_done >= coalesce(v_t.daily_cap, 1) then return jsonb_build_object('ok', false, 'error', 'daily_cap_reached'); end if;

  select * into v_ad from house_ads where is_active order by random() limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'ads_unavailable'); end if;

  insert into ad_views (user_id, task_key, house_ad_id, min_seconds)
  values (v_uid, p_task_key, v_ad.id, greatest(v_ad.duration_seconds, coalesce(v_t.threshold_seconds, 0)))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'view_id', v_id, 'duration_seconds', greatest(v_ad.duration_seconds, coalesce(v_t.threshold_seconds, 0)),
    'ad', jsonb_build_object('title', v_ad.title, 'image_url', v_ad.image_url, 'video_url', v_ad.video_url,
                             'cta_label', v_ad.cta_label, 'cta_url', v_ad.cta_url));
end;
$$;

create or replace function public.complete_ad_view(p_view_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_v ad_views%rowtype;
  v_t reward_tasks%rowtype;
  v_done integer;
  v_inserted integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_v from ad_views where id = p_view_id and user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_v.completed_at is not null then return jsonb_build_object('ok', false, 'error', 'already_completed'); end if;
  if now() - v_v.started_at > interval '30 minutes' then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if extract(epoch from (now() - v_v.started_at)) < v_v.min_seconds - 1 then
    return jsonb_build_object('ok', false, 'error', 'too_early');
  end if;

  select * into v_t from reward_tasks where key = v_v.task_key and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'ads_unavailable'); end if;
  select count(*) into v_done from reward_claims where user_id = v_uid and task_key = v_v.task_key and period = v_today::text;
  if v_done >= coalesce(v_t.daily_cap, 1) then return jsonb_build_object('ok', false, 'error', 'daily_cap_reached'); end if;

  insert into reward_claims (user_id, task_key, period, ref, coins)
  values (v_uid, v_v.task_key, v_today::text, p_view_id::text, v_t.reward_coins)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('ok', false, 'error', 'already_completed'); end if;

  update ad_views set completed_at = now(), coins = v_t.reward_coins where id = p_view_id;
  perform _credit(v_uid, 'reward_coins', v_t.reward_coins, 'ad:' || v_v.task_key, p_view_id::text);
  return jsonb_build_object('ok', true, 'credited', v_t.reward_coins, 'done', v_done + 1, 'cap', coalesce(v_t.daily_cap, 1));
end;
$$;

-- 12. Reserve New Drama: paying out when a reminder is set (title_reminders is upstream's table) ------------
create or replace function public.award_reserve_reward()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_t reward_tasks%rowtype;
  v_today_n integer;
  v_inserted integer;
begin
  select * into v_t from reward_tasks where key = 'reserve_drama' and kind = 'reserve' and is_active;
  if not found then return new; end if;

  select count(*) into v_today_n from reward_claims
   where user_id = new.user_id and task_key = 'reserve_drama'
     and (created_at at time zone 'Africa/Lagos')::date = reward_today();
  if v_today_n >= coalesce(v_t.daily_cap, 3) then return new; end if;

  -- once per title, ever: un-setting and re-setting a reminder cannot be farmed.
  insert into reward_claims (user_id, task_key, period, ref, coins)
  values (new.user_id, 'reserve_drama', 'once', new.title_id::text, v_t.reward_coins)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    perform _credit(new.user_id, 'reward_coins', v_t.reward_coins, 'task:reserve_drama', new.title_id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_title_reminders_reward on public.title_reminders;
create trigger trg_title_reminders_reward after insert on public.title_reminders
  for each row execute function public.award_reserve_reward();

-- 13. One call for the whole Rewards page --------------------------------------------------------------
create or replace function public.get_rewards_state()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := reward_today();
  v_s platform_settings%rowtype;
  v_ads boolean;
  v_w wallets%rowtype;
  v_last date;
  v_streak integer := 0;
  v_checked boolean := false;
  v_watch integer := 0;
  v_us user_settings%rowtype;
  v_email_ok boolean := false;
  v_sched jsonb;
  v_tasks jsonb;
  v_offers jsonb;
  v_idx integer;
begin
  select * into v_s from platform_settings where id = true;
  v_ads := coalesce(v_s.ads_enabled, false) and exists (select 1 from house_ads where is_active);
  select coalesce(jsonb_agg(jsonb_build_object('day_index', day_index, 'coins', coins) order by day_index), '[]'::jsonb)
    into v_sched from checkin_rewards;

  if v_uid is not null then
    select * into v_w from wallets where user_id = v_uid;
    select day, streak into v_last, v_streak from check_ins where user_id = v_uid order by day desc limit 1;
    if v_last is null or v_last < v_today - 1 then v_streak := 0; end if;
    v_checked := (v_last = v_today);
    select seconds into v_watch from daily_watch where user_id = v_uid and day = v_today;
    v_watch := coalesce(v_watch, 0);
    select * into v_us from user_settings where user_id = v_uid;
    select (email_confirmed_at is not null) into v_email_ok from auth.users where id = v_uid;
  end if;
  v_idx := case when v_checked then ((v_streak - 1) % 7) + 1 else (v_streak % 7) + 1 end;

  select coalesce(jsonb_agg(x order by (x->>'sort_order')::int, x->>'key'), '[]'::jsonb) into v_tasks from (
    select jsonb_build_object(
      'key', t.key, 'kind', t.kind, 'title', t.title, 'description', t.description,
      'reward_coins', t.reward_coins, 'daily_cap', coalesce(t.daily_cap, 1),
      'threshold_seconds', t.threshold_seconds, 'action_url', t.action_url, 'sort_order', t.sort_order,
      'done_count', case t.kind when 'reserve' then c.created_today_n
                                when 'ad' then c.today_n when 'checkin_ad' then c.today_n
                                when 'watch_time' then c.today_n else least(c.once_n, 1) end,
      'visited', rv.visited_at is not null,
      'progress_seconds', case when t.kind = 'watch_time' then v_watch else null end,
      'status', case t.kind
        when 'login' then case when v_uid is null then 'available' when c.once_n > 0 then 'done' else 'claimable' end
        when 'email' then case when v_uid is null then 'available' when c.once_n > 0 then 'done' when coalesce(v_email_ok, false) then 'claimable' else 'available' end
        when 'whatsapp' then case when v_uid is null then 'available' when c.once_n > 0 then 'done' when v_us.whatsapp_number is not null then 'claimable' else 'available' end
        when 'notifications' then case when v_uid is null then 'available' when c.once_n > 0 then 'done' when coalesce(v_us.push_permission, 'default') = 'granted' then 'claimable' else 'available' end
        when 'social' then case when v_uid is null then 'available' when c.once_n > 0 then 'done' when rv.visited_at is not null then 'claimable' else 'available' end
        when 'watch_time' then case when v_uid is null then 'available' when c.today_n > 0 then 'done' when v_watch >= coalesce(t.threshold_seconds, 0) then 'claimable' else 'available' end
        when 'reserve' then case when v_uid is null then 'available' when c.created_today_n >= coalesce(t.daily_cap, 3) then 'done' else 'available' end
        else case when v_uid is null then 'available' when c.today_n >= coalesce(t.daily_cap, 1) then 'done' else 'available' end
      end
    ) as x
    from reward_tasks t
    left join lateral (
      select count(*) filter (where cl.period = 'once') as once_n,
             count(*) filter (where cl.period = v_today::text) as today_n,
             count(*) filter (where (cl.created_at at time zone 'Africa/Lagos')::date = v_today) as created_today_n
        from reward_claims cl where cl.user_id = v_uid and cl.task_key = t.key
    ) c on true
    left join reward_visits rv on rv.user_id = v_uid and rv.task_key = t.key
    where t.is_active and (t.kind not in ('ad', 'checkin_ad') or v_ads)
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'title_id', t.id, 'title', t.title, 'slug', t.slug, 'poster_url', t.poster_url,
      'category', t.category, 'genre', t.genre, 'discount_percent', o.discount_percent, 'ends_at', o.ends_at
    ) order by o.sort_order, o.created_at), '[]'::jsonb)
    into v_offers
    from daily_offers o join titles t on t.id = o.title_id
   where o.is_active and now() between o.starts_at and o.ends_at and t.status = 'published';

  return jsonb_build_object(
    'signed_in', v_uid is not null,
    'today', v_today,
    'balances', jsonb_build_object(
      'coins', coalesce(v_w.coin_balance, 0), 'reward_coins', coalesce(v_w.reward_coin_balance, 0), 'points', coalesce(v_w.points_balance, 0)),
    'vip', case when v_uid is null then false else is_vip(v_uid) end,
    'streak', jsonb_build_object('current', v_streak, 'checked_in_today', v_checked, 'today_index', v_idx, 'schedule', v_sched),
    'tasks', v_tasks,
    'offers', v_offers,
    'ads_available', v_ads,
    'watch_seconds', v_watch
  );
end;
$$;

-- 14. Notifications: close the open insert policy, allow delete-own, go realtime ---------------------------------
drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications for insert to authenticated with check (is_admin());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (auth.uid() = user_id);
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 15. Seed (idempotent). Amounts are deliberately modest; tune in /admin/rewards. Social tasks start
-- inactive because they need your real profile URLs. ------------------------------------------------------------
insert into public.checkin_rewards (day_index, coins) values (1,3),(2,3),(3,5),(4,5),(5,8),(6,10),(7,15)
on conflict (day_index) do nothing;

insert into public.reward_tasks (key, kind, title, description, reward_coins, daily_cap, threshold_seconds, sort_order, is_active) values
  ('checkin_bonus_ad',     'checkin_ad',    'Get Bonus',                      'Watch a short promo for bonus coins on top of your check-in.', 2, 10, 15, 5,  true),
  ('watch_ad',             'ad',            'Watch Ads',                      'Watch a short promo to earn reward coins.',                     3, 10, 15, 10, true),
  ('login_reward',         'login',         'Login Reward',                   'A welcome gift for signing in.',                                30, null, null, 20, true),
  ('enable_notifications', 'notifications', 'Turn on notification permission','Get alerted when new episodes drop.',                          20, null, null, 30, true),
  ('link_whatsapp',        'whatsapp',      'Link WhatsApp',                  'Add your WhatsApp number for updates and support.',             30, null, null, 40, true),
  ('link_email',           'email',         'Link Email',                     'Verify your email address.',                                    30, null, null, 50, true),
  ('reserve_drama',        'reserve',       'Reserve New Drama',              'Set a reminder on an upcoming title.',                          10, 3,    null, 60, true),
  ('follow_youtube',       'social',        'Follow us on YouTube',           null,                                                            10, null, 8,    70, false),
  ('follow_tiktok',        'social',        'Follow us on TikTok',            null,                                                            10, null, 8,    80, false),
  ('follow_facebook',      'social',        'Follow us on Facebook',          null,                                                            10, null, 8,    90, false),
  ('follow_instagram',     'social',        'Follow us on Instagram',         null,                                                            10, null, 8,    100, false),
  ('watch_10',             'watch_time',    'Watch 10 mins',                  'Watch for 10 minutes today.',                                   4,  null, 600,  110, true),
  ('watch_15',             'watch_time',    'Watch 15 mins',                  'Watch for 15 minutes today.',                                   8,  null, 900,  120, true),
  ('watch_20',             'watch_time',    'Watch 20 mins',                  'Watch for 20 minutes today.',                                   16, null, 1200, 130, true)
on conflict (key) do nothing;

-- 16. Grants: RPCs are for signed-in users (get_rewards_state also serves guests) ------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'daily_check_in()', 'watch_heartbeat(uuid,integer)', 'link_whatsapp(text)', 'mark_social_visit(text)',
    'claim_reward_task(text)', 'start_ad_view(text)', 'complete_ad_view(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.get_rewards_state() from public, anon, authenticated;
grant execute on function public.get_rewards_state() to anon, authenticated;
revoke all on function public.award_reserve_reward() from public, anon, authenticated;
