-- A title has one primary genre (titles.genre, drives the home genre filter)
-- plus up to 3 extra "vibe" tags from the same genres list, stored in
-- title_genres. Everything shown as a tag = primary genre + those tags.

create or replace function public.enforce_title_tag_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (select count(*) from title_genres where title_id = new.title_id) >= 3 then
    raise exception 'A title can have at most 3 extra tags';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_title_tag_limit on public.title_genres;
create trigger trg_title_tag_limit
  before insert on public.title_genres
  for each row execute function public.enforce_title_tag_limit();

-- Titles most like the given one: ranked by how many tags (primary genre
-- included) they share, then by popularity. Only published titles, per the
-- caller's normal RLS.
create or replace function public.similar_titles(p_title_id uuid, p_limit int default 8)
returns table (id uuid, slug text, title text, poster_url text, shared_tags int)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with mine as (
    select g.id from genres g join titles t on lower(g.name) = lower(t.genre) where t.id = p_title_id
    union
    select genre_id from title_genres where title_id = p_title_id
  ),
  scored as (
    select t.id, t.slug, t.title, t.poster_url, t.total_unique_views,
      (select count(*) from mine m where m.id in (
          select g2.id from genres g2 where lower(g2.name) = lower(t.genre)
          union
          select genre_id from title_genres where title_id = t.id
      ))::int as shared_tags
    from titles t
    where t.status = 'published' and t.id <> p_title_id
  )
  select s.id, s.slug, s.title, s.poster_url, s.shared_tags
  from scored s
  order by s.shared_tags desc, s.total_unique_views desc
  limit greatest(1, least(p_limit, 24));
$$;

revoke all on function public.similar_titles(uuid, int) from public;
grant execute on function public.similar_titles(uuid, int) to anon, authenticated;
