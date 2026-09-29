CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text)
 RETURNS TABLE(id uuid, username text, display_name text, email text, role user_role, creator_status creator_status, is_partner boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select p.id, p.username, p.display_name, u.email::text, p.role, p.creator_status,
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
$function$;
