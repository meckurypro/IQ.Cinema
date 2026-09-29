create or replace function public.admin_decline_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_amount numeric;
  v_status withdrawal_status;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select user_id, amount_naira, status into v_user_id, v_amount, v_status
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'already_processed');
  end if;

  update public.withdrawal_requests
    set status = 'declined', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_withdrawal_id;

  -- The balance was already deducted when the request was submitted
  -- (request_withdrawal), so declining has to hand it back.
  update public.wallets
    set earnings_balance_naira = earnings_balance_naira + v_amount
    where user_id = v_user_id;

  insert into public.notifications (user_id, type, title, body)
  values (
    v_user_id,
    'withdrawal_declined',
    'Withdrawal declined',
    'Your withdrawal request of ₦' || v_amount || ' was declined. The amount has been returned to your balance.'
  );

  return jsonb_build_object('ok', true);
end;
$$;
