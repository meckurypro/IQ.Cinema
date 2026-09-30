-- supabase/migrations/20260930120100_backfill_counters_with_guard_flag.sql
--
-- The backfill in 20260930120000 rebuilt titles.total_* while the title guard
-- trigger was still active, which reverted those two columns. Redo the title and
-- creator_metrics rollups with the counter-write flag set.

do $$
begin
  perform set_config('app.counter_write', 'on', true);

  update public.titles t
     set total_unique_views = coalesce((select sum(e.unique_views) from public.episodes e where e.title_id = t.id), 0),
         total_watch_seconds = coalesce((select sum(e.total_watch_seconds) from public.episodes e where e.title_id = t.id), 0);

  update public.creator_metrics cm
     set unique_views = coalesce((select sum(t.total_unique_views) from public.titles t where t.creator_id = cm.user_id), 0),
         watch_hours = coalesce((select sum(t.total_watch_seconds) from public.titles t where t.creator_id = cm.user_id), 0)::numeric / 3600,
         updated_at = now();

  perform set_config('app.counter_write', 'off', true);
end $$;
