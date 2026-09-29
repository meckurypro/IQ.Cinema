-- Promo episodes: what shows on the For You feed.
-- A promo is either an existing numbered episode flagged is_promo=true,
-- or a dedicated clip that is NOT part of the 1..N numbering (episode_number = 0).
-- Reuses the episodes table/bucket/RLS wholesale — no parallel structure.

alter table public.episodes
  add column if not exists is_promo boolean not null default false;

alter table public.episodes
  add constraint episodes_episode_number_nonneg check (episode_number >= 0) not valid;
alter table public.episodes validate constraint episodes_episode_number_nonneg;

-- At most one promo per title.
create unique index if not exists episodes_one_promo_per_title
  on public.episodes (title_id) where is_promo;

-- Fast "For You" scans.
create index if not exists episodes_promo_feed_idx
  on public.episodes (published_at desc) where is_promo and status = 'published';

-- Atomic swap: unset whichever episode currently holds the promo slot for
-- this title, then set the requested one. Two statements in one function
-- body run in the same transaction, so the partial unique index above never
-- sees both rows true at once.
create or replace function public.set_promo_episode(p_title_id uuid, p_episode_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (public.is_creator_of_title(p_title_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if not exists (select 1 from episodes where id = p_episode_id and title_id = p_title_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update episodes set is_promo = false where title_id = p_title_id and is_promo;
  update episodes set is_promo = true where id = p_episode_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_promo_episode(uuid, uuid) from public, anon;
grant execute on function public.set_promo_episode(uuid, uuid) to authenticated;

-- Promo clips are the marketing hook — always freely playable, regardless
-- of the free-episode-count gate a normal episode number would hit.
drop policy if exists videos_viewer_read on storage.objects;
create policy videos_viewer_read on storage.objects
  for select to public
  using (
    bucket_id = 'videos'
    and exists (
      select 1
      from episodes e join titles t on t.id = e.title_id
      where e.video_url = storage.objects.name
        and e.status = 'published'
        and (
          e.is_promo
          or e.episode_number <= coalesce(t.free_episode_count, (select default_free_episodes from platform_settings limit 1))
          or exists (select 1 from episode_unlocks eu where eu.episode_id = e.id and eu.user_id = auth.uid())
          or exists (select 1 from subscriptions s where s.user_id = auth.uid() and s.status = 'active' and s.current_period_end > now())
        )
    )
  );

-- One RPC feeds the whole For You page: promo episodes with inherited
-- title tags/category, newest-published first.
create or replace function public.get_for_you_feed(p_limit integer default 15, p_before timestamptz default null)
returns table (
  episode_id uuid,
  episode_number integer,
  video_url text,
  duration_seconds integer,
  save_count bigint,
  comment_count bigint,
  share_count bigint,
  title_id uuid,
  slug text,
  title text,
  synopsis text,
  poster_url text,
  content_rating text,
  category text,
  tags text[],
  total_episodes integer,
  total_unique_views bigint,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id, e.episode_number, e.video_url, e.duration_seconds,
    e.save_count, e.comment_count, e.share_count,
    t.id, t.slug, t.title, t.synopsis, t.poster_url, t.content_rating, t.category,
    coalesce(
      (select array_agg(g.name order by g.name) from title_genres tg join genres g on g.id = tg.genre_id where tg.title_id = t.id),
      case when t.genre is not null then array[t.genre] else array[]::text[] end
    ),
    (select count(*)::int from episodes e2 where e2.title_id = t.id and e2.status = 'published' and e2.episode_number > 0),
    t.total_unique_views,
    e.published_at
  from episodes e
  join titles t on t.id = e.title_id
  where e.is_promo and e.status = 'published' and t.status = 'published'
    and (p_before is null or e.published_at < p_before)
  order by e.published_at desc nulls last
  limit greatest(1, least(p_limit, 30));
$$;

revoke all on function public.get_for_you_feed(integer, timestamptz) from public, anon;
grant execute on function public.get_for_you_feed(integer, timestamptz) to authenticated, anon;
