-- supabase/migrations/20260930120000_harden_view_counting.sql
--
-- Hardens view / watch-time counting.
--
-- Problems fixed:
--  1. trg_titles_status_guard silently reverted titles.total_unique_views and
--     total_watch_seconds on every non-admin update, including the ones issued
--     by record_play, so title-level views never counted.
--  2. plays was directly insertable by anon (policy plays_insert_any, WITH CHECK
--     true) and get_for_you_feed_v2 ranks on plays, so feed ranking and
--     "recent_views" could be forged without calling the RPC at all.
--  3. record_play trusted client-supplied cumulative watched_seconds and added
--     the full cumulative value on every heartbeat to watch_time_snapshots
--     (double counting), had no plausibility check or rate limit, counted
--     unpublished episodes and creators watching their own titles, and could
--     race under concurrent calls.
--  4. Anonymous views never reached creator_metrics.
--  5. creator_metrics.watch_hours was numeric(12,2), so small increments rounded
--     away to nothing.
--  6. Excess table privileges (TRUNCATE / TRIGGER / REFERENCES) for anon and
--     authenticated on the metrics tables.

-- 0. Private schema, salt for IP hashing, and a backup of counters we touch ---
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.secrets (
  name  text primary key,
  value text not null
);
revoke all on private.secrets from public, anon, authenticated;
insert into private.secrets (name, value)
values ('play_ip_salt', gen_random_uuid()::text)
on conflict (name) do nothing;

create table if not exists private.counter_backup_20260930 as
  select 'episode'::text as kind, id as ref_id, unique_views::bigint as views, total_watch_seconds::bigint as watch_seconds
    from public.episodes
  union all
  select 'title', id, total_unique_views, total_watch_seconds from public.titles
  union all
  select 'creator_metrics', user_id, unique_views, round(watch_hours * 3600)::bigint from public.creator_metrics;
revoke all on private.counter_backup_20260930 from public, anon, authenticated;

create table if not exists private.watch_time_snapshots_bak_20260930 as
  select * from public.watch_time_snapshots;
revoke all on private.watch_time_snapshots_bak_20260930 from public, anon, authenticated;

-- 1. plays: new columns, constraints, indexes --------------------------------
alter table public.plays add column if not exists delta_seconds integer not null default 0;
alter table public.plays add column if not exists ip_hash text;

alter table public.plays drop constraint if exists plays_watched_nonneg;
alter table public.plays add constraint plays_watched_nonneg check (watched_seconds >= 0 and delta_seconds >= 0);

alter table public.plays drop constraint if exists plays_device_id_len;
alter table public.plays add constraint plays_device_id_len
  check (device_id is null or char_length(device_id) between 8 and 64) not valid;

create index if not exists plays_device_episode_idx on public.plays (device_id, episode_id, created_at desc);
create index if not exists plays_ip_episode_unique_idx on public.plays (ip_hash, episode_id, created_at desc) where is_unique;

-- 2. Lock down direct writes ---------------------------------------------------
drop policy if exists plays_insert_any on public.plays;
revoke insert, update, delete, truncate, references, trigger on public.plays from anon, authenticated;
revoke truncate, references, trigger on public.watch_time_snapshots from anon, authenticated;
revoke truncate, references, trigger on public.creator_metrics from anon, authenticated;

-- 3. watch_hours needs sub-hour precision --------------------------------------
alter table public.creator_metrics alter column watch_hours type numeric(14, 4);

-- 4. Guard trigger: let record_play maintain counters --------------------------
create or replace function public.enforce_title_status_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Non-admin (the owning creator, per titles_update_own_or_admin RLS).
  -- Review/audit fields are admin-only, always.
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.admin_review_note := old.admin_review_note;
  new.review_ignored_at := old.review_ignored_at;
  new.published_at := old.published_at;

  -- Counters are only writable by record_play, which sets this transaction-local
  -- flag. Clients cannot set custom GUCs through PostgREST.
  if current_setting('app.counter_write', true) is distinct from 'on' then
    new.total_unique_views := old.total_unique_views;
    new.total_watch_seconds := old.total_watch_seconds;
  end if;

  if new.status is distinct from old.status then
    if current_setting('app.title_status_guard_bypass', true) is distinct from 'on' then
      raise exception 'Use the submit-for-review or withdraw action to change a project''s status.'
        using errcode = '42501';
    end if;
    if new.status not in ('draft', 'in_review', 'withdrawn') then
      raise exception 'Not allowed to set project status to %', new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- Counter bumps should not touch titles.updated_at.
drop trigger if exists trg_titles_updated_at on public.titles;
create trigger trg_titles_updated_at
  before update on public.titles
  for each row
  when (current_setting('app.counter_write', true) is distinct from 'on')
  execute function public.set_updated_at();

-- 5. record_play ---------------------------------------------------------------
-- Same signature (backwards compatible with cached clients).
-- watched_seconds is the client's cumulative watch time for the current playback
-- session. The server never trusts it: it derives a per-call delta that is
-- bounded by real elapsed time since the viewer's previous report.
create or replace function public.record_play(
  p_user_id uuid,
  p_device_id text,
  p_episode_id uuid,
  p_watched_seconds integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c_ip_cap        constant int := 40;   -- unique views per IP per episode per 24h (CGNAT-friendly)
  c_min_interval  constant int := 3;    -- seconds between accepted reports per viewer/episode
  c_first_cap     constant int := 30;   -- max seconds creditable on the first report of a session
  c_grace         constant int := 5;    -- clock/latency slack
  c_unknown_dur   constant int := 30;   -- seconds needed to count a view when duration is unknown

  v_episode   episodes%rowtype;
  v_title     titles%rowtype;
  v_settings  platform_settings%rowtype;
  v_last      plays%rowtype;
  v_has_last  boolean := false;
  v_device    text;
  v_dur       int;
  v_base      int := 0;
  v_max_delta int;
  v_delta     int := 0;
  v_watched   int := 0;
  v_fraction  numeric := 0;
  v_is_unique boolean := false;
  v_capped    boolean := false;
  v_headers   json;
  v_ip        text;
  v_ip_hash   text;
  v_salt      text;
  v_ip_count  int;
  v_viewer    text;
begin
  if p_user_id is not null and p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_watched_seconds is null or p_watched_seconds < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_watched');
  end if;

  v_device := case when p_device_id is not null and char_length(p_device_id) between 8 and 64 then p_device_id end;
  if p_user_id is null and v_device is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  -- Only published episodes of published titles count.
  select e.* into v_episode from episodes e where e.id = p_episode_id and e.status = 'published';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select t.* into v_title from titles t where t.id = v_episode.title_id and t.status = 'published';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_settings from platform_settings where id = true;
  v_dur := coalesce(v_episode.duration_seconds, 0);

  v_viewer := case when p_user_id is not null then 'u:' || p_user_id::text else 'd:' || v_device end;
  -- Serialise concurrent reports from the same viewer for the same episode.
  perform pg_advisory_xact_lock(hashtextextended(v_viewer || ':' || p_episode_id::text, 0));

  select p.* into v_last
    from plays p
   where p.episode_id = p_episode_id
     and p.created_at > now() - interval '30 minutes'
     and ((p_user_id is not null and p.user_id = p_user_id)
       or (p_user_id is null and p.user_id is null and p.device_id = v_device))
   order by p.created_at desc
   limit 1;
  v_has_last := found;

  if v_has_last and v_last.created_at > now() - make_interval(secs => c_min_interval) then
    return jsonb_build_object('ok', true, 'throttled', true);
  end if;

  if v_has_last and p_watched_seconds >= v_last.watched_seconds then
    -- Continuing the same playback session.
    v_base := v_last.watched_seconds;
    v_max_delta := greatest(0, floor(extract(epoch from (now() - v_last.created_at)))::int) + c_grace;
  else
    -- First report, or the client reset its counter (new session).
    v_base := 0;
    v_max_delta := c_first_cap;
  end if;

  v_delta := least(greatest(p_watched_seconds - v_base, 0), v_max_delta);
  v_watched := v_base + v_delta;

  if v_dur > 0 then
    v_fraction := least(v_watched, v_dur)::numeric / v_dur;
  elsif v_watched >= c_unknown_dur then
    v_fraction := 1;
  end if;

  -- Request IP (hashed, never stored raw) for a per-IP cap on unique views.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  if v_headers is not null then
    v_ip := coalesce(
      nullif(trim(v_headers->>'cf-connecting-ip'), ''),
      nullif(trim(v_headers->>'x-real-ip'), ''),
      nullif(trim((string_to_array(coalesce(v_headers->>'x-forwarded-for', ''), ','))[
        array_length(string_to_array(coalesce(v_headers->>'x-forwarded-for', ''), ','), 1)
      ]), '')
    );
  end if;
  if v_ip is not null then
    select s.value into v_salt from private.secrets s where s.name = 'play_ip_salt';
    v_ip_hash := encode(sha256(convert_to(coalesce(v_salt, '') || ':' || v_ip, 'utf8')), 'hex');
  end if;

  if v_fraction >= v_settings.min_watch_fraction
     and p_user_id is distinct from v_title.creator_id then
    if not exists (
      select 1 from plays p
       where p.episode_id = p_episode_id
         and p.is_unique
         and p.created_at > now() - make_interval(hours => v_settings.unique_view_window_hours)
         and ((p_user_id is not null and p.user_id = p_user_id)
           or (p_user_id is null and p.user_id is null and p.device_id = v_device))
    ) then
      if v_ip_hash is not null then
        select count(*) into v_ip_count
          from plays p
         where p.ip_hash = v_ip_hash
           and p.episode_id = p_episode_id
           and p.is_unique
           and p.created_at > now() - interval '24 hours';
        if v_ip_count >= c_ip_cap then
          v_capped := true;
        end if;
      end if;
      v_is_unique := not v_capped;
    end if;
  end if;

  insert into plays (user_id, device_id, episode_id, title_id, watched_seconds,
                     episode_duration_seconds, is_unique, delta_seconds, ip_hash)
  values (p_user_id, v_device, p_episode_id, v_episode.title_id, v_watched,
          v_episode.duration_seconds, v_is_unique, v_delta, v_ip_hash);

  if v_is_unique or v_delta > 0 then
    perform set_config('app.counter_write', 'on', true);

    update episodes
       set unique_views = unique_views + case when v_is_unique then 1 else 0 end,
           total_watch_seconds = total_watch_seconds + v_delta
     where id = p_episode_id;

    update titles
       set total_unique_views = total_unique_views + case when v_is_unique then 1 else 0 end,
           total_watch_seconds = total_watch_seconds + v_delta
     where id = v_episode.title_id;

    update creator_metrics
       set unique_views = unique_views + case when v_is_unique then 1 else 0 end,
           watch_hours = watch_hours + (v_delta::numeric / 3600),
           updated_at = now()
     where user_id = v_title.creator_id;

    perform set_config('app.counter_write', 'off', true);

    if v_delta > 0 then
      insert into watch_time_snapshots (creator_id, period_start, period_end, watch_seconds)
      values (
        v_title.creator_id,
        date_trunc('month', now())::date,
        (date_trunc('month', now()) + interval '1 month - 1 day')::date,
        v_delta
      )
      on conflict (creator_id, period_start, period_end)
      do update set watch_seconds = watch_time_snapshots.watch_seconds + excluded.watch_seconds;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'is_unique', v_is_unique, 'counted_seconds', v_delta);
end;
$function$;

revoke all on function public.record_play(uuid, text, uuid, integer) from public;
grant execute on function public.record_play(uuid, text, uuid, integer) to anon, authenticated;

-- 6. Backfill: derive deltas for historic plays, then rebuild every counter -----
with ordered as (
  select id,
         watched_seconds,
         created_at,
         lag(watched_seconds) over w as prev_watched,
         lag(created_at) over w as prev_at
    from public.plays
  window w as (partition by coalesce(user_id::text, device_id), episode_id order by created_at)
),
calc as (
  select id,
         case
           when prev_watched is null then least(watched_seconds, 30)
           when watched_seconds >= prev_watched then
             least(watched_seconds - prev_watched,
                   greatest(0, floor(extract(epoch from (created_at - prev_at)))::int) + 5)
           else least(watched_seconds, 30)
         end as d
    from ordered
)
update public.plays p set delta_seconds = c.d from calc c where c.id = p.id;

update public.episodes e
   set unique_views = coalesce((select count(*) from public.plays p where p.episode_id = e.id and p.is_unique), 0),
       total_watch_seconds = coalesce((select sum(p.delta_seconds) from public.plays p where p.episode_id = e.id), 0);

update public.titles t
   set total_unique_views = coalesce((select sum(e.unique_views) from public.episodes e where e.title_id = t.id), 0),
       total_watch_seconds = coalesce((select sum(e.total_watch_seconds) from public.episodes e where e.title_id = t.id), 0);

update public.creator_metrics cm
   set unique_views = coalesce(s.views, 0),
       watch_hours = coalesce(s.secs, 0)::numeric / 3600,
       updated_at = now()
  from (
    select cm2.user_id,
           (select sum(t.total_unique_views) from public.titles t where t.creator_id = cm2.user_id) as views,
           (select sum(t.total_watch_seconds) from public.titles t where t.creator_id = cm2.user_id) as secs
      from public.creator_metrics cm2
  ) s
 where s.user_id = cm.user_id;

update public.watch_time_snapshots w
   set watch_seconds = coalesce((
     select sum(p.delta_seconds)
       from public.plays p
       join public.titles t on t.id = p.title_id
      where t.creator_id = w.creator_id
        and p.created_at >= w.period_start
        and p.created_at < (w.period_end + 1)
   ), 0);
