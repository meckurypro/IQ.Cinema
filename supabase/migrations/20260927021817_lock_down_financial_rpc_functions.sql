
-- Critical finding while auditing route access: several SECURITY DEFINER
-- RPC functions took a p_user_id/p_creator_id parameter with NO check that
-- it matched the caller (auth.uid()), and were callable directly over
-- PostgREST by any authenticated (some even anon) client — independent of
-- whatever the frontend UI does or doesn't show.
--
-- Concretely, before this migration:
--   - request_withdrawal(p_user_id, ...) let ANY authenticated user drain
--     ANY other user's earnings_balance_naira into a withdrawal_requests
--     row carrying the attacker's own bank details. profiles is publicly
--     SELECT-able, so victim user ids were trivially discoverable.
--   - unlock_episode(p_user_id, ...) let anyone spend ANY other user's
--     coin balance to unlock an episode for themselves.
--   - credit_coins(p_user_id, p_coins, ...) let anyone mint themselves (or
--     anyone) unlimited coins with no payment at all — it's meant to be
--     called only by the paystack-webhook Edge Function after verifying
--     a real Paystack payment.
--   - release_creator_escrow(p_creator_id) — meant to be an admin-only
--     payout release, callable by any authenticated user with no check.
--   - distribute_subscription_pool(...) — a revenue-distribution batch
--     job; calling it twice for the same period double-pays every
--     creator from platform funds. Not meant to be client-callable at all.
--   - credit_creator_earning, check_partner_eligibility, issue_strike,
--     record_play had similar gaps (arbitrary crediting / info leak /
--     unauthenticated moderation action / spoofable play attribution).

-- 1. request_withdrawal: caller must be the account holder AND an active partner.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_user_id uuid, p_amount_naira numeric, p_bank_account_name text, p_bank_account_number text, p_bank_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_settings platform_settings%rowtype;
  v_balance numeric;
  v_id uuid;
begin
  if p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from creator_partner_state where user_id = p_user_id and is_partner = true) then
    return jsonb_build_object('ok', false, 'error', 'not_a_partner');
  end if;

  select * into v_settings from platform_settings where id = true;
  select earnings_balance_naira into v_balance from wallets where user_id = p_user_id for update;

  if p_amount_naira < v_settings.min_payout_threshold_naira then
    return jsonb_build_object('ok', false, 'error', 'below_minimum_threshold', 'minimum', v_settings.min_payout_threshold_naira);
  end if;

  if p_amount_naira > v_balance then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_balance);
  end if;

  update wallets set earnings_balance_naira = earnings_balance_naira - p_amount_naira where user_id = p_user_id;

  insert into withdrawal_requests (user_id, amount_naira, bank_account_name, bank_account_number, bank_code)
  values (p_user_id, p_amount_naira, p_bank_account_name, p_bank_account_number, p_bank_code)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'withdrawal_id', v_id);
end;
$function$;

-- 2. unlock_episode: caller can only unlock (and spend coins) for themselves.
CREATE OR REPLACE FUNCTION public.unlock_episode(p_user_id uuid, p_episode_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_episode episodes%rowtype;
  v_title titles%rowtype;
  v_settings platform_settings%rowtype;
  v_cost int;
  v_free_count int;
  v_balance bigint;
  v_txn_id uuid;
  v_creator_share numeric;
  v_has_active_sub boolean;
  v_episode_is_new_release boolean;
begin
  if p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_episode from episodes where id = p_episode_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'episode_not_found');
  end if;

  select * into v_title from titles where id = v_episode.title_id;
  select * into v_settings from platform_settings where id = true;

  if exists (select 1 from episode_unlocks where user_id = p_user_id and episode_id = p_episode_id) then
    return jsonb_build_object('ok', true, 'already_unlocked', true);
  end if;

  v_free_count := coalesce(v_title.free_episode_count, v_settings.default_free_episodes);

  if v_episode.episode_number <= v_free_count then
    insert into episode_unlocks (user_id, episode_id, unlocked_via) values (p_user_id, p_episode_id, 'free');
    return jsonb_build_object('ok', true, 'method', 'free');
  end if;

  v_episode_is_new_release := (v_episode.published_at is not null and v_episode.published_at > now() - interval '14 days');

  select exists(
    select 1 from subscriptions
    where user_id = p_user_id and status = 'active' and current_period_end > now()
  ) into v_has_active_sub;

  if v_has_active_sub and not v_episode_is_new_release then
    insert into episode_unlocks (user_id, episode_id, unlocked_via) values (p_user_id, p_episode_id, 'subscription');
    return jsonb_build_object('ok', true, 'method', 'subscription');
  end if;

  v_cost := coalesce(v_episode.unlock_cost_coins, v_settings.default_episode_unlock_coins);

  select coin_balance into v_balance from wallets where user_id = p_user_id for update;
  if v_balance < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_coins', 'required', v_cost, 'balance', v_balance);
  end if;

  update wallets set coin_balance = coin_balance - v_cost where user_id = p_user_id;

  insert into transactions (user_id, type, status, coin_amount, related_episode_id, related_title_id, related_creator_id)
  values (p_user_id, 'episode_unlock', 'completed', -v_cost, p_episode_id, v_title.id, v_title.creator_id)
  returning id into v_txn_id;

  insert into episode_unlocks (user_id, episode_id, transaction_id, unlocked_via)
  values (p_user_id, p_episode_id, v_txn_id, 'coins');

  v_creator_share := (v_cost * v_settings.coin_to_naira) * v_settings.creator_revenue_share;

  insert into transactions (user_id, type, status, amount_naira, related_episode_id, related_title_id, related_creator_id)
  values (v_title.creator_id, 'creator_earning', 'completed', v_creator_share, p_episode_id, v_title.id, v_title.creator_id);

  perform credit_creator_earning(v_title.creator_id, v_creator_share);

  return jsonb_build_object('ok', true, 'method', 'coins', 'spent', v_cost);
end;
$function$;

-- 3. record_play: a device-based play (p_user_id null) is still allowed for
--    anonymous viewers, but a user_id-attributed play must be the caller's own.
CREATE OR REPLACE FUNCTION public.record_play(p_user_id uuid, p_device_id text, p_episode_id uuid, p_watched_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_episode episodes%rowtype;
  v_settings platform_settings%rowtype;
  v_is_unique boolean := false;
  v_recent_unique boolean;
  v_fraction numeric;
begin
  if p_user_id is not null and p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_episode from episodes where id = p_episode_id;
  select * into v_settings from platform_settings where id = true;

  if v_episode.duration_seconds is not null and v_episode.duration_seconds > 0 then
    v_fraction := p_watched_seconds::numeric / v_episode.duration_seconds;
  else
    v_fraction := 0;
  end if;

  if v_fraction >= v_settings.min_watch_fraction then
    select exists(
      select 1 from plays
      where episode_id = p_episode_id
        and is_unique = true
        and created_at > now() - (v_settings.unique_view_window_hours || ' hours')::interval
        and (
          (p_user_id is not null and user_id = p_user_id) or
          (p_user_id is null and device_id = p_device_id)
        )
    ) into v_recent_unique;

    v_is_unique := not v_recent_unique;
  end if;

  insert into plays (user_id, device_id, episode_id, title_id, watched_seconds, episode_duration_seconds, is_unique)
  values (p_user_id, p_device_id, p_episode_id, v_episode.title_id, p_watched_seconds, v_episode.duration_seconds, v_is_unique);

  if v_is_unique then
    update episodes set unique_views = unique_views + 1, total_watch_seconds = total_watch_seconds + p_watched_seconds
      where id = p_episode_id;
    update titles set total_unique_views = total_unique_views + 1, total_watch_seconds = total_watch_seconds + p_watched_seconds
      where id = v_episode.title_id;

    if p_user_id is not null then
      update creator_metrics
        set unique_views = unique_views + 1,
            watch_hours = watch_hours + (p_watched_seconds::numeric / 3600),
            updated_at = now()
        where user_id = (select creator_id from titles where id = v_episode.title_id);
    end if;
  end if;

  insert into watch_time_snapshots (creator_id, period_start, period_end, watch_seconds)
  values (
    (select creator_id from titles where id = v_episode.title_id),
    date_trunc('month', now())::date,
    (date_trunc('month', now()) + interval '1 month - 1 day')::date,
    p_watched_seconds
  )
  on conflict (creator_id, period_start, period_end)
  do update set watch_seconds = watch_time_snapshots.watch_seconds + excluded.watch_seconds;

  return jsonb_build_object('ok', true, 'is_unique', v_is_unique);
end;
$function$;

-- 4. check_partner_eligibility: only the creator themself or an admin may view it.
CREATE OR REPLACE FUNCTION public.check_partner_eligibility(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_settings platform_settings%rowtype;
  v_metrics creator_metrics%rowtype;
  v_approved_at timestamptz;
  v_account_age_days int;
  v_delayed_until timestamptz;
  v_eligible boolean;
begin
  if p_user_id is distinct from auth.uid() and not is_admin() then
    return jsonb_build_object('eligible', false, 'error', 'forbidden');
  end if;

  select * into v_settings from platform_settings where id = true;
  select * into v_metrics from creator_metrics where user_id = p_user_id;

  select reviewed_at into v_approved_at from creator_applications
    where user_id = p_user_id and status = 'approved'
    order by reviewed_at desc limit 1;

  v_account_age_days := coalesce(extract(day from now() - v_approved_at), 0);

  select eligibility_delayed_until into v_delayed_until from creator_partner_state where user_id = p_user_id;

  v_eligible := v_metrics.unique_views >= v_settings.partner_min_unique_views
    and v_metrics.watch_hours >= v_settings.partner_min_watch_hours
    and v_metrics.episode_count >= v_settings.partner_min_episodes
    and v_account_age_days >= v_settings.partner_min_account_age_days
    and (select count(*) from strikes where creator_id = p_user_id and expires_at > now()) = 0
    and (v_delayed_until is null or v_delayed_until <= now());

  return jsonb_build_object(
    'eligible', v_eligible,
    'unique_views', v_metrics.unique_views, 'unique_views_required', v_settings.partner_min_unique_views,
    'watch_hours', v_metrics.watch_hours, 'watch_hours_required', v_settings.partner_min_watch_hours,
    'episode_count', v_metrics.episode_count, 'episode_count_required', v_settings.partner_min_episodes,
    'account_age_days', v_account_age_days, 'account_age_required', v_settings.partner_min_account_age_days,
    'active_strikes', (select count(*) from strikes where creator_id = p_user_id and expires_at > now()),
    'delayed_until', v_delayed_until
  );
end;
$function$;

-- 5. release_creator_escrow: admin-only payout release.
CREATE OR REPLACE FUNCTION public.release_creator_escrow(p_creator_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
begin
  if not is_admin() then
    return;
  end if;

  update wallets
  set earnings_balance_naira = earnings_balance_naira + escrow_balance_naira,
      escrow_balance_naira = 0
  where user_id = p_creator_id;
end;
$function$;

-- 6. issue_strike: staff or admin only (moderation action).
CREATE OR REPLACE FUNCTION public.issue_strike(p_creator_id uuid, p_report_id uuid, p_reason text, p_issued_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_settings platform_settings%rowtype;
  v_active_strikes int;
  v_is_partner boolean;
begin
  if not is_staff_or_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_settings from platform_settings where id = true;

  insert into strikes (creator_id, report_id, reason, issued_by, expires_at)
  values (p_creator_id, p_report_id, p_reason, p_issued_by, now() + (v_settings.strike_expiry_months || ' months')::interval);

  insert into notifications (user_id, type, title, body)
  values (p_creator_id, 'strike', 'A strike was issued on your account', p_reason);

  select count(*) into v_active_strikes from strikes where creator_id = p_creator_id and expires_at > now();

  if v_active_strikes >= v_settings.strikes_before_suspension then
    select is_partner into v_is_partner from creator_partner_state where user_id = p_creator_id;

    if v_is_partner then
      update creator_partner_state
        set is_partner = false,
            suspended_until = now() + (v_settings.strike_suspension_months || ' months')::interval
        where user_id = p_creator_id;

      insert into notifications (user_id, type, title, body)
      values (p_creator_id, 'partner_suspended', 'Partner Program membership suspended',
        'Your Partner Program membership has been suspended for ' || v_settings.strike_suspension_months || ' months following repeated strikes.');
    else
      update creator_partner_state
        set eligibility_delayed_until = now() + (v_settings.strike_suspension_months || ' months')::interval
        where user_id = p_creator_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'active_strikes', v_active_strikes);
end;
$function$;

-- 7. Metadata-only hardening (no logic change) for the two batch/internal
--    ledger functions, ahead of the grant changes below.
ALTER FUNCTION public.credit_coins(uuid, bigint, numeric, text) SET search_path = public;
ALTER FUNCTION public.distribute_subscription_pool(date, date) SET search_path = public;
ALTER FUNCTION public.credit_creator_earning(uuid, numeric) SET search_path = public;

-- 8. Grants: tighten every function above to only who should ever call it.
--    credit_coins and distribute_subscription_pool are internal/webhook-only
--    (never called with a user's own JWT) — service_role only.
--    credit_creator_earning is only ever called from within other
--    SECURITY DEFINER functions (which run as the owner, unaffected by
--    revoking these grants) — nobody needs a direct grant.
REVOKE EXECUTE ON FUNCTION public.credit_coins(uuid, bigint, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, bigint, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.distribute_subscription_pool(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_subscription_pool(date, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.credit_creator_earning(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- These require a logged-in user (their own JWT) and are called from the
-- client with the anon key + a session — keep authenticated, drop anon.
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_episode(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_partner_eligibility(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_creator_escrow(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_strike(uuid, uuid, text, uuid) FROM anon;

-- record_play legitimately supports anonymous, device-id-based plays —
-- anon stays, the ownership check above covers the attributed-play case.
