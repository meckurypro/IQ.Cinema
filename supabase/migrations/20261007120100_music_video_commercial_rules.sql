-- 20261007120100_music_video_commercial_rules.sql
--
-- Step 2 of 2. Rules for the new content types (see previous migration).
--
--   * Duration caps:  music_video 10:00, commercial 3:00
--   * Orientation:    series/films stay strictly 9:16 portrait. Music videos
--                     and commercials are very often shot landscape, so they
--                     may be 9:16 OR 16:9 (the player letterboxes landscape).
--   * Categories:     'music' and 'commercial' join drama/story/anime so the
--                     existing category filters (Library, For You) pick them up.
--   * credit_name:    the artist (music video) or brand (commercial).

-- 1. Credit line ---------------------------------------------------------
alter table public.titles
  add column if not exists credit_name text;

alter table public.titles
  drop constraint if exists titles_credit_name_len;
alter table public.titles
  add constraint titles_credit_name_len
  check (credit_name is null or char_length(credit_name) <= 80);

-- 2. Categories ----------------------------------------------------------
alter table public.titles
  drop constraint if exists titles_category_check;
alter table public.titles
  add constraint titles_category_check
  check (category = any (array['drama','story','anime','music','commercial']));

-- 3. Duration caps -------------------------------------------------------
create or replace function public.max_duration_seconds_for(ct public.content_type)
returns integer
language sql
immutable
set search_path = public
as $$
  select case ct
    when 'short_episode' then 160    -- 2:40
    when 'full_episode'  then 1200   -- 20:00
    when 'one_part_film' then 7200   -- 120:00
    when 'music_video'   then 600    -- 10:00
    when 'commercial'    then 180    -- 3:00
  end;
$$;

-- 4. Orientation + duration validation ----------------------------------
create or replace function public.validate_episode_media()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_content_type public.content_type;
  v_max_seconds integer;
  v_ratio numeric;
  v_portrait boolean;
  v_landscape boolean;
begin
  select content_type into v_content_type from public.titles where id = new.title_id;
  v_max_seconds := public.max_duration_seconds_for(v_content_type);

  if new.duration_seconds is not null and new.duration_seconds > v_max_seconds then
    raise exception 'Duration % s exceeds the % s limit for content_type %',
      new.duration_seconds, v_max_seconds, v_content_type
      using errcode = '23514';
  end if;

  if new.video_width is not null and new.video_height is not null and new.video_height > 0 then
    v_ratio := new.video_width::numeric / new.video_height::numeric;
    -- 9:16 portrait = 0.5625, 16:9 landscape = 1.7778; small tolerance for
    -- encoder rounding.
    v_portrait  := abs(v_ratio - 0.5625) <= 0.02;
    v_landscape := abs(v_ratio - (16.0 / 9.0)) <= 0.04;

    if v_content_type in ('music_video', 'commercial') then
      if not (v_portrait or v_landscape) then
        raise exception 'Video must be 9:16 portrait or 16:9 landscape (got %x%)',
          new.video_width, new.video_height
          using errcode = '23514';
      end if;
    elsif not v_portrait then
      raise exception 'Video must be 9:16 portrait (got %x%)', new.video_width, new.video_height
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

-- 5. Genres that make sense for the new content types ---------------------
--    Idempotent (re-running, or an admin having added one already, is fine).
insert into public.genres (name, slug) values
  -- music videos
  ('Afrobeats',   'afrobeats'),
  ('Hip-Hop',     'hip-hop'),
  ('R&B',         'r-and-b'),
  ('Pop',         'pop'),
  ('Gospel',      'gospel'),
  ('Amapiano',    'amapiano'),
  ('Highlife',    'highlife'),
  ('Dancehall',   'dancehall'),
  ('Alternative', 'alternative'),
  -- commercials
  ('Fashion & Beauty', 'fashion-and-beauty'),
  ('Food & Drink',     'food-and-drink'),
  ('Tech',             'tech'),
  ('Finance',          'finance'),
  ('Automotive',       'automotive'),
  ('Lifestyle',        'lifestyle')
on conflict do nothing;
