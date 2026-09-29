
-- Tidy up after the last two migrations, per the security advisor.
-- (pg_net itself doesn't support ALTER EXTENSION ... SET SCHEMA — it's
-- pinned to the public schema by the extension itself; its "extension in
-- public" advisor note is a common, low-severity WARN for any project using
-- pg_net and isn't fixable without dropping/recreating the extension.)

-- 1. Pin search_path on the two functions from the upload-pipeline migration
--    that were missing it (matches the pattern already used elsewhere, e.g. is_admin()).
ALTER FUNCTION public.max_duration_seconds_for(public.content_type) SET search_path = public;
ALTER FUNCTION public.validate_episode_media() SET search_path = public;

-- 2. handle_new_user and trigger_transcode_episode are trigger-only functions,
--    never meant to be called directly by a client — Postgres grants EXECUTE
--    to PUBLIC by default, which exposes them over PostgREST's RPC endpoint.
--    Triggers still run fine after this (they execute as the table owner,
--    not as the invoking role).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_transcode_episode() FROM PUBLIC, anon, authenticated;
