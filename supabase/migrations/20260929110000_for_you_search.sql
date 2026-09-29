-- For You search: filter-as-you-type over promo episodes (the feed's content).
--
--  * Every word the user types must appear somewhere in the title, synopsis,
--    genre or category (so "thriller lagos" narrows as more words are added).
--  * Ranked: title-prefix > title word-prefix > title contains > genre >
--    synopsis. Tiny popularity tie-break.
--  * Typo tolerance: for queries of 4+ characters, titles that are close in
--    trigram similarity also match (e.g. "stil standng" -> "Still Standing").
--
-- SECURITY DEFINER only so it can read consistently; it returns published
-- promo episodes of published titles, same as get_for_you_feed_v2.

create extension if not exists pg_trgm with schema extensions;

create index if not exists titles_title_trgm_idx
  on public.titles using gin (title extensions.gin_trgm_ops);
create index if not exists titles_synopsis_trgm_idx
  on public.titles using gin (synopsis extensions.gin_trgm_ops);

create or replace function public.search_for_you_promos(
  p_query  text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  episode_id uuid, episode_number integer, video_url text, thumbnail_url text,
  duration_seconds integer, save_count bigint, like_count bigint,
  comment_count bigint, share_count bigint,
  title_id uuid, slug text, title text, synopsis text, poster_url text,
  content_rating text, category text, tags text[], total_episodes integer,
  total_unique_views bigint, published_at timestamptz,
  is_new boolean, feed_rank integer, recent_views bigint,
  match_source text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with q as (
    select btrim(regexp_replace(lower(coalesce(p_query, '')), '\s+', ' ', 'g')) as raw
  ),
  toks as (
    -- LIKE-escaped patterns ('!' is the escape char), max 6 words.
    select replace(replace(replace(u.tok, '!', '!!'), '%', '!%'), '_', '!_') as pat
    from q, unnest(string_to_array(q.raw, ' ')) as u(tok)
    where u.tok <> ''
    limit 6
  ),
  cand as (
    select
      e, t,
      lower(coalesce(
        (select string_agg(g.name, ' ') from title_genres tg join genres g on g.id = tg.genre_id where tg.title_id = t.id),
        ''
      ) || ' ' || coalesce(t.genre, '') || ' ' || coalesce(t.category, '')) as gtxt
    from episodes e
    join titles t on t.id = e.title_id
    where e.is_promo and e.status = 'published' and t.status = 'published'
  ),
  matched as (
    select
      c.e, c.t,
      m.all_hit, m.score, m.in_title, m.in_syn,
      case when length((select raw from q)) >= 4
           then word_similarity((select raw from q), lower((c.t).title)) else 0 end as sim
    from cand c
    cross join lateral (
      select
        bool_and(h.hit) as all_hit,
        sum(h.sc)       as score,
        bool_or(h.in_title) as in_title,
        bool_or(h.in_syn)   as in_syn
      from toks
      cross join lateral (
        select
          (lower((c.t).title) like '%' || toks.pat || '%' escape '!') as in_title,
          (lower(coalesce((c.t).synopsis, '')) like '%' || toks.pat || '%' escape '!') as in_syn,
          (lower((c.t).title) like '%' || toks.pat || '%' escape '!'
            or lower(coalesce((c.t).synopsis, '')) like '%' || toks.pat || '%' escape '!'
            or c.gtxt like '%' || toks.pat || '%' escape '!') as hit,
          (case
             when lower((c.t).title) like toks.pat || '%' escape '!' then 6
             when lower((c.t).title) like '% ' || toks.pat || '%' escape '!' then 5
             when lower((c.t).title) like '%' || toks.pat || '%' escape '!' then 3
             else 0 end
           + case when c.gtxt like '%' || toks.pat || '%' escape '!' then 1.5 else 0 end
           + case when lower(coalesce((c.t).synopsis, '')) like '%' || toks.pat || '%' escape '!' then 1 else 0 end
          ) as sc
      ) h
    ) m
  )
  select
    (x.e).id, (x.e).episode_number, (x.e).video_url, (x.e).thumbnail_url, (x.e).duration_seconds,
    (x.e).save_count, (x.e).like_count, (x.e).comment_count, (x.e).share_count,
    (x.t).id, (x.t).slug, (x.t).title, (x.t).synopsis, (x.t).poster_url,
    (x.t).content_rating, (x.t).category,
    coalesce(
      (select array_agg(g.name order by g.name)
         from title_genres tg join genres g on g.id = tg.genre_id
        where tg.title_id = (x.t).id),
      case when (x.t).genre is not null then array[(x.t).genre] else array[]::text[] end
    ),
    (select count(*)::int from episodes e2
      where e2.title_id = (x.t).id and e2.status = 'published' and e2.episode_number > 0),
    (x.t).total_unique_views,
    (x.e).published_at,
    (coalesce((x.t).published_at, (x.e).published_at) > now() - interval '30 days'),
    (row_number() over (order by (coalesce(x.score, 0) + x.sim * 4 + ln(1 + (x.t).total_unique_views) * 0.1) desc, (x.e).id))::int,
    0::bigint,
    case
      when x.all_hit and x.in_title then 'title'
      when x.all_hit and x.in_syn   then 'synopsis'
      when x.all_hit                then 'genre'
      else 'fuzzy'
    end
  from matched x
  where (select raw from q) <> ''
    and (coalesce(x.all_hit, false) or x.sim >= 0.5)
  order by (coalesce(x.score, 0) + x.sim * 4 + ln(1 + (x.t).total_unique_views) * 0.1) desc, (x.e).id
  limit greatest(1, least(p_limit, 30))
  offset greatest(0, p_offset);
$function$;

grant execute on function public.search_for_you_promos(text, integer, integer)
  to anon, authenticated;
