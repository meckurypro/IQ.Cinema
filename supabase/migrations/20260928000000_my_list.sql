-- My List: Following / History / Reminder Set
-- Additive only. Nothing existing is dropped or rewritten.

-- 1. Category (Drama / Story / Anime) ----------------------------------------
alter table public.titles
  add column if not exists category text not null default 'drama';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.titles'::regclass and conname = 'titles_category_check'
  ) then
    alter table public.titles
      add constraint titles_category_check check (category in ('drama', 'story', 'anime'));
  end if;
end $$;

create index if not exists titles_category_idx on public.titles (category);

-- 2. Reminders ("Reminder Set" tab) ------------------------------------------
create table if not exists public.title_reminders (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title_id    uuid not null references public.titles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, title_id)
);

create index if not exists title_reminders_title_idx on public.title_reminders (title_id);

alter table public.title_reminders enable row level security;

drop policy if exists title_reminders_own on public.title_reminders;
create policy title_reminders_own on public.title_reminders
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- History is read newest-first per user.
create index if not exists watch_history_user_updated_idx
  on public.watch_history (user_id, updated_at desc);

-- 3. Notify reminder holders when a coming-soon title premieres -----------------
create or replace function public.notify_title_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'coming_soon' and new.status = 'published' then
    insert into public.notifications (user_id, type, title, body, metadata)
    select r.user_id,
           'title_released',
           new.title || ' is out now',
           'A title you set a reminder for just premiered.',
           jsonb_build_object('title_id', new.id, 'slug', new.slug)
    from public.title_reminders r
    where r.title_id = new.id and r.notified_at is null;

    update public.title_reminders
       set notified_at = now()
     where title_id = new.id and notified_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_titles_notify_reminders on public.titles;
create trigger trg_titles_notify_reminders
  after update of status on public.titles
  for each row execute function public.notify_title_reminders();

-- 4. Read: one RPC feeds every tab --------------------------------------------
-- kind: following | history | reminders_released | reminders_upcoming
-- "Following" = title-level follows (watchlist) plus titles with saved episodes,
-- which is how the app already treated My List before this change.
create or replace function public.get_my_list(p_kind text, p_category text default null)
returns table (
  title_id            uuid,
  slug                text,
  title               text,
  poster_url          text,
  is_exclusive        boolean,
  category            text,
  status              text,
  tags                text[],
  total_episodes      integer,
  last_episode_number integer,
  resume_episode_id   uuid,
  is_following        boolean,
  has_reminder        boolean,
  has_new_episode     boolean,
  activity_at         timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if p_kind not in ('following', 'history', 'reminders_released', 'reminders_upcoming') then
    raise exception 'Unknown list kind: %', p_kind using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('drama', 'story', 'anime') then
    raise exception 'Unknown category: %', p_category using errcode = '22023';
  end if;

  return query
  with followed as (
    select w.title_id, w.created_at as at
      from watchlist w where w.user_id = v_uid
    union all
    select e.title_id, s.created_at
      from episode_saves s join episodes e on e.id = s.episode_id
     where s.user_id = v_uid
  ),
  follow_agg as (
    select f.title_id, max(f.at) as followed_at from followed f group by f.title_id
  ),
  last_watch as (
    select distinct on (h.title_id)
           h.title_id, h.episode_id, h.completed, h.updated_at, e.episode_number
      from watch_history h join episodes e on e.id = h.episode_id
     where h.user_id = v_uid
     order by h.title_id, h.updated_at desc
  ),
  my_reminders as (
    select r.title_id, r.created_at from title_reminders r where r.user_id = v_uid
  ),
  scope as (
    select f.title_id, f.followed_at as at from follow_agg f where p_kind = 'following'
    union all
    select l.title_id, l.updated_at from last_watch l where p_kind = 'history'
    union all
    select r.title_id, r.created_at from my_reminders r
     where p_kind in ('reminders_released', 'reminders_upcoming')
  )
  select
    t.id,
    t.slug,
    t.title,
    t.poster_url,
    t.is_exclusive,
    t.category,
    t.status::text,
    coalesce(
      (select array_agg(g.name order by g.name)
         from title_genres tg join genres g on g.id = tg.genre_id
        where tg.title_id = t.id),
      case when t.genre is not null then array[t.genre] else array[]::text[] end
    ),
    es.total,
    coalesce(lw.episode_number, 1),
    case
      when lw.episode_id is null then
        (select e.id from episodes e
          where e.title_id = t.id and e.status = 'published'
          order by e.episode_number limit 1)
      when lw.completed then
        coalesce(
          (select e.id from episodes e
            where e.title_id = t.id and e.status = 'published'
              and e.episode_number > lw.episode_number
            order by e.episode_number limit 1),
          lw.episode_id)
      else lw.episode_id
    end,
    fa.title_id is not null,
    rm.title_id is not null,
    coalesce(lw.episode_id is not null
      and es.latest_no > lw.episode_number
      and es.latest_pub > lw.updated_at, false),
    case when p_kind = 'following'
         then greatest(s.at, lw.updated_at)
         else s.at end
  from scope s
  join titles t on t.id = s.title_id
  left join follow_agg fa on fa.title_id = t.id
  left join last_watch lw on lw.title_id = t.id
  left join my_reminders rm on rm.title_id = t.id
  cross join lateral (
    select count(*)::int as total,
           max(e.episode_number) as latest_no,
           max(e.published_at) as latest_pub
      from episodes e
     where e.title_id = t.id and e.status = 'published'
  ) es
  where (
          (p_kind in ('following', 'history', 'reminders_released') and t.status = 'published')
       or (p_kind = 'reminders_upcoming' and t.status = 'coming_soon')
        )
    and (p_category is null or p_kind like 'reminders%' or t.category = p_category)
  order by
    coalesce(p_kind = 'following'
       and lw.episode_id is not null
       and es.latest_no > lw.episode_number
       and es.latest_pub > lw.updated_at, false) desc,
    case when p_kind = 'following'
         then greatest(s.at, lw.updated_at)
         else s.at end desc nulls last
  limit 200;
end;
$$;

-- 5. Write: batch-friendly, RLS still applies (security invoker) ----------------
create or replace function public.set_titles_follow(p_title_ids uuid[], p_follow boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_follow then
    insert into watchlist (user_id, title_id)
    select v_uid, t.id from titles t
     where t.id = any (p_title_ids) and t.status = 'published'
    on conflict do nothing;
  else
    -- Unfollow clears both sources so the title actually leaves Following.
    delete from watchlist where user_id = v_uid and title_id = any (p_title_ids);
    delete from episode_saves
     where user_id = v_uid
       and episode_id in (select e.id from episodes e where e.title_id = any (p_title_ids));
  end if;
end;
$$;

create or replace function public.remove_from_history(p_title_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from watch_history
   where user_id = auth.uid() and title_id = any (p_title_ids);
end;
$$;

create or replace function public.set_title_reminders(p_title_ids uuid[], p_on boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_on then
    if exists (
      select 1 from unnest(p_title_ids) as x(id)
       where not exists (select 1 from titles t where t.id = x.id and t.status = 'coming_soon')
    ) then
      raise exception 'Reminders can only be set for upcoming titles' using errcode = 'P0001';
    end if;
    insert into title_reminders (user_id, title_id)
    select v_uid, x from unnest(p_title_ids) as x
    on conflict do nothing;
  else
    delete from title_reminders where user_id = v_uid and title_id = any (p_title_ids);
  end if;
end;
$$;

-- Title page: one call for both button states.
create or replace function public.get_title_user_state(p_title_id uuid)
returns table (is_following boolean, has_reminder boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (
      exists (select 1 from watchlist w where w.user_id = auth.uid() and w.title_id = p_title_id)
      or exists (
        select 1 from episode_saves s join episodes e on e.id = s.episode_id
         where s.user_id = auth.uid() and e.title_id = p_title_id
      )
    ),
    exists (select 1 from title_reminders r where r.user_id = auth.uid() and r.title_id = p_title_id);
$$;

-- 6. Lock the RPCs to signed-in users ------------------------------------------
revoke all on function public.get_my_list(text, text)               from public, anon;
revoke all on function public.set_titles_follow(uuid[], boolean)    from public, anon;
revoke all on function public.remove_from_history(uuid[])           from public, anon;
revoke all on function public.set_title_reminders(uuid[], boolean)  from public, anon;
revoke all on function public.get_title_user_state(uuid)            from public, anon;

grant execute on function public.get_my_list(text, text)              to authenticated;
grant execute on function public.set_titles_follow(uuid[], boolean)   to authenticated;
grant execute on function public.remove_from_history(uuid[])          to authenticated;
grant execute on function public.set_title_reminders(uuid[], boolean) to authenticated;
grant execute on function public.get_title_user_state(uuid)           to authenticated;
