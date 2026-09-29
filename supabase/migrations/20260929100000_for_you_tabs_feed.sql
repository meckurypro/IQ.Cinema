-- For You tabs: one ranked promo-episode feed serving
--   for_you  -> blended relevance (recency decay + engagement + recent views
--               + small boost for genres the signed-in user has watched)
--   new      -> newest releases (title publish date, newest first)
--   trending -> hottest in the last 7 days (unique views x3, plays, saves,
--               shares, comments, likes); ties fall back to all-time views
-- p_category filters any tab (drives the Collections chips).
--
-- Additive: get_for_you_feed / get_for_you_promo_by_slug are untouched.
-- SECURITY DEFINER because `plays` and `watch_history` are RLS-protected;
-- the function only ever returns published promo episodes of published titles.

create index if not exists plays_title_created_idx
  on public.plays (title_id, created_at desc);

create or replace function public.get_for_you_feed_v2(
  p_tab      text    default 'for_you',
  p_limit    integer default 8,
  p_offset   integer default 0,
  p_category text    default null
)
returns table (
  episode_id uuid, episode_number integer, video_url text, thumbnail_url text,
  duration_seconds integer, save_count bigint, like_count bigint,
  comment_count bigint, share_count bigint,
  title_id uuid, slug text, title text, synopsis text, poster_url text,
  content_rating text, category text, tags text[], total_episodes integer,
  total_unique_views bigint, published_at timestamptz,
  is_new boolean, feed_rank integer, recent_views bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with recent as (
    select p.title_id,
           count(*) filter (where p.is_unique) as uv,
           count(*)                            as pl
    from plays p
    where p.created_at > now() - interval '7 days'
    group by p.title_id
  ),
  liked_genres as (
    select distinct t2.genre
    from watch_history w
    join titles t2 on t2.id = w.title_id
    where w.user_id = auth.uid() and t2.genre is not null
  ),
  scored as (
    select
      e, t,
      coalesce(r.uv, 0) as uv,
      (e.save_count * 2 + e.share_count * 2 + e.comment_count + e.like_count)::double precision as eng,
      coalesce(t.published_at, e.published_at) as released_at,
      exists (select 1 from liked_genres lg where lg.genre = t.genre) as affinity,
      coalesce(r.pl, 0) as pl
    from episodes e
    join titles t on t.id = e.title_id
    left join recent r on r.title_id = t.id
    where e.is_promo and e.status = 'published' and t.status = 'published'
      and (p_category is null or t.category = p_category)
  ),
  keyed as (
    select s.*,
      case lower(coalesce(p_tab, 'for_you'))
        when 'new' then
          extract(epoch from s.released_at)
        when 'trending' then
          s.uv * 3 + s.pl + s.eng
        else
          ln(1 + (s.t).total_unique_views)
          + s.eng * 0.5
          + s.uv
          + 10 * exp(-extract(epoch from (now() - s.released_at)) / 86400.0 / 14.0)
          + case when s.affinity then 4 else 0 end
      end::double precision as sort_key,
      -- trending ties (e.g. a quiet week) fall back to all-time views
      (s.t).total_unique_views as tie_views
    from scored s
  )
  select
    (k.e).id, (k.e).episode_number, (k.e).video_url, (k.e).thumbnail_url, (k.e).duration_seconds,
    (k.e).save_count, (k.e).like_count, (k.e).comment_count, (k.e).share_count,
    (k.t).id, (k.t).slug, (k.t).title, (k.t).synopsis, (k.t).poster_url,
    (k.t).content_rating, (k.t).category,
    coalesce(
      (select array_agg(g.name order by g.name)
         from title_genres tg join genres g on g.id = tg.genre_id
        where tg.title_id = (k.t).id),
      case when (k.t).genre is not null then array[(k.t).genre] else array[]::text[] end
    ),
    (select count(*)::int from episodes e2
      where e2.title_id = (k.t).id and e2.status = 'published' and e2.episode_number > 0),
    (k.t).total_unique_views,
    (k.e).published_at,
    (k.released_at > now() - interval '30 days'),
    (row_number() over (order by k.sort_key desc, k.tie_views desc, (k.e).id))::int,
    k.uv::bigint
  from keyed k
  order by k.sort_key desc, k.tie_views desc, (k.e).id
  limit greatest(1, least(p_limit, 30))
  offset greatest(0, p_offset);
$function$;

grant execute on function public.get_for_you_feed_v2(text, integer, integer, text)
  to anon, authenticated;
