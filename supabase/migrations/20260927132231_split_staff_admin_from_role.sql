
-- 1. Staff and admin become independent flags, decoupled from the
--    viewer -> creator -> partner content-tier progression.
alter table public.profiles
  add column if not exists is_staff boolean not null default false,
  add column if not exists is_admin boolean not null default false;

-- 2. Backfill from the old exclusive `role` column before we repurpose it.
update public.profiles set is_staff = true where role = 'staff';
update public.profiles set is_admin = true where role = 'admin';

-- 3. Re-derive content tier for anyone whose `role` had been overwritten by
--    staff/admin (which clobbered whatever creator tier they actually had).
--    Anyone with an approved/partner creator_status was a creator; everyone
--    else falls back to viewer.
update public.profiles
  set role = case when creator_status in ('approved', 'partner') then 'creator'::user_role
                   else 'viewer'::user_role end
  where role in ('staff', 'admin');

-- 4. From here on `role` only ever means the content tier.
alter table public.profiles
  add constraint profiles_role_content_tier_only check (role in ('viewer', 'creator'));

-- 5. Permission checks now read the independent flags instead of the
--    (formerly) exclusive role value, so RLS policies built on these three
--    helpers pick up the fix automatically -- no policy needs to change.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and is_admin = true);
$function$;

create or replace function public.is_staff()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and is_staff = true);
$function$;

create or replace function public.is_staff_or_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and (is_staff = true or is_admin = true));
$function$;

-- 6. Replace the old exclusive admin_set_user_role RPC (which forced
--    viewer/creator/staff/admin/partner into one mutually-exclusive slot)
--    with one that updates the content tier and the two flags
--    independently. Passing null for a param leaves that part untouched.
--    Setting tier = 'partner' still auto-implies creator, per product rules.
drop function if exists public.admin_set_user_role(uuid, text);

create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_tier text default null,        -- 'viewer' | 'creator' | 'partner' | null (leave unchanged)
  p_is_staff boolean default null, -- null = leave unchanged
  p_is_admin boolean default null  -- null = leave unchanged
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role public.user_role;
  v_creator_status public.creator_status;
  v_is_partner boolean;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  if p_tier is not null and p_tier not in ('viewer', 'creator', 'partner') then
    return jsonb_build_object('ok', false, 'error', 'invalid_tier');
  end if;

  if p_tier is not null then
    if p_tier = 'viewer' then
      v_role := 'viewer'; v_creator_status := 'none'; v_is_partner := false;
    elsif p_tier = 'creator' then
      v_role := 'creator'; v_creator_status := 'approved'; v_is_partner := false;
    else -- partner implies creator
      v_role := 'creator'; v_creator_status := 'partner'; v_is_partner := true;
    end if;

    update public.profiles set role = v_role, creator_status = v_creator_status where id = p_user_id;

    insert into public.creator_partner_state (user_id, is_partner, partner_since, suspended_until, eligibility_delayed_until)
    values (p_user_id, v_is_partner, case when v_is_partner then now() else null end, null, null)
    on conflict (user_id) do update
      set is_partner = v_is_partner,
          partner_since = case when v_is_partner then coalesce(creator_partner_state.partner_since, now()) else null end,
          suspended_until = null,
          eligibility_delayed_until = null;
  end if;

  if p_is_staff is not null then
    update public.profiles set is_staff = p_is_staff where id = p_user_id;
  end if;

  if p_is_admin is not null then
    update public.profiles set is_admin = p_is_admin where id = p_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

-- 7. meckury's role got flipped from admin to staff earlier in this session
--    via the old exclusive-radio bug (clicking "Staff" silently revoked
--    admin). Restore admin alongside the staff flag he set, now that
--    they're independent.
update public.profiles set is_admin = true where username = 'meckury';
