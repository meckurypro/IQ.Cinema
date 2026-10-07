-- 20261007120000_add_music_video_commercial_content_types.sql
--
-- Step 1 of 2. Adds the two new kinds of content creators can upload besides
-- series and films. Kept in its own migration on purpose: Postgres does not
-- allow a freshly added enum value to be used in the same transaction that
-- added it, so everything that *uses* the values lives in the next migration.

alter type public.content_type add value if not exists 'music_video';
alter type public.content_type add value if not exists 'commercial';
