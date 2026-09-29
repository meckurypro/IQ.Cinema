
-- Generic, extensible toggle table — so hiding/showing more links later is a
-- row insert, not another migration. Publicly readable (every client needs
-- to check these to decide what to render), admin-only to write.
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_select_all ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY feature_flags_admin_write ON public.feature_flags FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER feature_flags_set_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('become_creator_link', 'Become a Creator link', 'Shows the "Become a creator" link on the Profile page', true);

-- Admin user search — joins auth.users for email, which isn't otherwise
-- exposed to any client. Matches on username, display name, or email.
CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  email text,
  role public.user_role,
  creator_status public.creator_status,
  is_partner boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select p.id, p.username, p.display_name, u.email, p.role, p.creator_status,
         coalesce(cps.is_partner, false), p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.creator_partner_state cps on cps.user_id = p.id
  where p_query is null or p_query = ''
     or p.username ilike '%' || p_query || '%'
     or p.display_name ilike '%' || p_query || '%'
     or u.email ilike '%' || p_query || '%'
  order by p.created_at desc
  limit 25;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_search_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text) TO authenticated;

-- Admin role assignment — 'partner' isn't a role value, it's role=creator +
-- creator_status='partner' + creator_partner_state.is_partner=true. Every
-- target fully resets role, creator_status, AND the partner flag together,
-- so an admin action can never leave a stale privilege behind (e.g.
-- demoting a partner to viewer must also clear is_partner — that flag is
-- what request_withdrawal actually checks, not the role column).
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_target text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_role public.user_role;
  v_creator_status public.creator_status;
  v_is_partner boolean;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_target not in ('viewer', 'creator', 'staff', 'admin', 'partner') then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  if p_target = 'partner' then
    v_role := 'creator'; v_creator_status := 'partner'; v_is_partner := true;
  elsif p_target = 'creator' then
    v_role := 'creator'; v_creator_status := 'approved'; v_is_partner := false;
  else
    v_role := p_target::public.user_role; v_creator_status := 'none'; v_is_partner := false;
  end if;

  update public.profiles set role = v_role, creator_status = v_creator_status where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  insert into public.creator_partner_state (user_id, is_partner, partner_since, suspended_until, eligibility_delayed_until)
  values (p_user_id, v_is_partner, case when v_is_partner then now() else null end, null, null)
  on conflict (user_id) do update
    set is_partner = v_is_partner,
        partner_since = case when v_is_partner then coalesce(creator_partner_state.partner_since, now()) else null end,
        suspended_until = null,
        eligibility_delayed_until = null;

  return jsonb_build_object('ok', true, 'role', v_role, 'creator_status', v_creator_status, 'is_partner', v_is_partner);
end;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
