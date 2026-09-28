-- Unique movie titles with clean, title-only slugs (no random suffix).
-- The slug is what appears in shared links: /title/still-standing and
-- /watch/still-standing/ep-2. Old suffixed slugs (still-standing-b34779) are
-- still resolved by the app and redirected to the clean one.

create extension if not exists unaccent with schema extensions;

create or replace function public.slugify_title(p_title text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(p_title, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

-- Server-authoritative on insert: trim the title and derive the slug from it,
-- whatever the client sent. Titles with no Latin characters fall back to a
-- short id so the slug is never empty.
create or replace function public.titles_set_slug()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.title := btrim(new.title);
  new.slug := public.slugify_title(new.title);
  if new.slug = '' then
    new.slug := 'title-' || left(replace(new.id::text, '-', ''), 8);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_titles_set_slug on public.titles;
create trigger trg_titles_set_slug
  before insert on public.titles
  for each row execute function public.titles_set_slug();

-- Renames keep the slug (links stay stable) but still can't collide.
create or replace function public.titles_trim_title()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);
  return new;
end;
$$;

drop trigger if exists trg_titles_trim_title on public.titles;
create trigger trg_titles_trim_title
  before update of title on public.titles
  for each row execute function public.titles_trim_title();

-- Backfill existing rows (there were no duplicates when this was written; the
-- unique index below will fail loudly rather than silently merge if there are).
update public.titles
   set title = btrim(title),
       slug  = case when public.slugify_title(title) = ''
                    then 'title-' || left(replace(id::text, '-', ''), 8)
                    else public.slugify_title(title) end
 where slug is distinct from public.slugify_title(btrim(title))
    or title <> btrim(title);

create unique index if not exists titles_title_unique_idx
  on public.titles (lower(btrim(title)));
