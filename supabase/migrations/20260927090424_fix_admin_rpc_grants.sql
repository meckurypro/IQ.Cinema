
-- New functions get an automatic EXECUTE grant to anon/authenticated/
-- service_role at creation time (Supabase's default privileges on the
-- public schema), separate from the implicit PUBLIC grant — revoking
-- PUBLIC alone doesn't touch it. These two are admin-only.
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
