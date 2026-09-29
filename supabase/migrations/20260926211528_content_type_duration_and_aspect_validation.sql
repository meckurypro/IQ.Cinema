
-- 1. Redefine content_type to the three real upload types (0 rows exist, safe to swap)
ALTER TABLE public.titles ALTER COLUMN content_type DROP DEFAULT;

CREATE TYPE public.content_type_new AS ENUM ('short_episode', 'full_episode', 'one_part_film');

ALTER TABLE public.titles
  ALTER COLUMN content_type TYPE public.content_type_new
  USING (
    CASE content_type::text
      WHEN 'series' THEN 'full_episode'
      WHEN 'movie' THEN 'one_part_film'
    END
  )::public.content_type_new;

DROP TYPE public.content_type;
ALTER TYPE public.content_type_new RENAME TO content_type;

ALTER TABLE public.titles ALTER COLUMN content_type SET DEFAULT 'full_episode'::content_type;

-- 2. Store raw video metadata read client-side before upload
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS video_width integer,
  ADD COLUMN IF NOT EXISTS video_height integer;

-- 3. Per-content-type duration caps, enforced server-side as a backstop
--    to the client-side check (defense in depth — never trust the client alone)
CREATE OR REPLACE FUNCTION public.max_duration_seconds_for(ct public.content_type)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE ct
    WHEN 'short_episode' THEN 160   -- 2:40
    WHEN 'full_episode'  THEN 1200  -- 20:00
    WHEN 'one_part_film' THEN 7200  -- 120:00
  END;
$$;

CREATE OR REPLACE FUNCTION public.validate_episode_media()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_content_type public.content_type;
  v_max_seconds integer;
  v_ratio numeric;
BEGIN
  SELECT content_type INTO v_content_type FROM public.titles WHERE id = NEW.title_id;
  v_max_seconds := public.max_duration_seconds_for(v_content_type);

  IF NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > v_max_seconds THEN
    RAISE EXCEPTION 'Duration % s exceeds the % s limit for content_type %',
      NEW.duration_seconds, v_max_seconds, v_content_type
      USING ERRCODE = '23514';
  END IF;

  IF NEW.video_width IS NOT NULL AND NEW.video_height IS NOT NULL AND NEW.video_height > 0 THEN
    v_ratio := NEW.video_width::numeric / NEW.video_height::numeric;
    -- 9:16 portrait = 0.5625, allow a small tolerance for encoder rounding
    IF abs(v_ratio - 0.5625) > 0.02 THEN
      RAISE EXCEPTION 'Video must be 9:16 portrait (got %sx%s)', NEW.video_width, NEW.video_height
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_episode_media_trigger ON public.episodes;
CREATE TRIGGER validate_episode_media_trigger
  BEFORE INSERT OR UPDATE ON public.episodes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_episode_media();
