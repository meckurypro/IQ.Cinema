create or replace function public.admin_list_withdrawals(p_status text default 'requested')
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  email text,
  amount_naira numeric,
  bank_account_name text,
  bank_account_number text,
  bank_code text,
  status withdrawal_status,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select w.id, w.user_id, p.username, p.display_name, u.email,
         w.amount_naira, w.bank_account_name, w.bank_account_number, w.bank_code,
         w.status, w.requested_at
  from public.withdrawal_requests w
  join public.profiles p on p.id = w.user_id
  join auth.users u on u.id = w.user_id
  where p_status is null or w.status::text = p_status
  order by w.requested_at asc
  limit 50;
end;
$$;
