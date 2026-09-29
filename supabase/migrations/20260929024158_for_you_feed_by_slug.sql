-- Same row shape as get_for_you_feed, for one title by slug — used when a
-- "Similar titles" tap inside For You needs to jump straight to that
-- title's promo without leaving the feed.
create or replace function public.get_for_you_promo_by_slug(p_slug text)
returns table (
  episode_id uuid,
  episode_number integer,
  video_url text,
  thumbnail_url text,
  duration_seconds integer,
  save_count bigint,
  like_count bigint,
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
    e.id, e.episode_number, e.video_url, e.thumbnail_url, e.duration_seconds,
    e.save_count, e.like_count, e.comment_count, e.share_count,
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
  where t.slug = p_slug and e.is_promo and e.status = 'published' and t.status = 'published'
  limit 1;
$$;

revoke all on function public.get_for_you_promo_by_slug(text) from public, anon;
grant execute on function public.get_for_you_promo_by_slug(text) to authenticated, anon;
