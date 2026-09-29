
-- Profiles were previously only ever created by a client-side insert right
-- after signUp() — but there's no INSERT policy on public.profiles for a
-- normal user, so that insert was always silently rejected by RLS (the
-- signup page never checked the error). Every signup was leaving the user
-- with an auth.users row but no profiles row at all.
--
-- Move profile creation into a trigger on auth.users so it always happens,
-- regardless of RLS, client timing, or whether email confirmation is
-- pending. Username collisions are resolved by appending a numeric suffix.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  final_username text;
  suffix int := 0;
BEGIN
  base_username := regexp_replace(
    lower(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))),
    '[^a-z0-9_]+', '', 'g'
  );
  IF base_username = '' THEN
    base_username := 'user';
  END IF;
  final_username := base_username;

  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, display_name)
      VALUES (NEW.id, final_username, COALESCE(NEW.raw_user_meta_data->>'username', base_username));
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      suffix := suffix + 1;
      final_username := base_username || suffix::text;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
