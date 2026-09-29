-- Store + VIP membership, payment fulfilment, two-balance unlock with daily offers and coupons,
-- coupons, Member Points (daily box + redemption).
-- unlock_episode keeps its response contract ({ok,error:'insufficient_coins',required,balance,...}) so
-- the current watch page keeps working. The 2-arg overload is dropped and replaced by a 3-arg version
-- with a defaulted p_coupon_id (keeping both would make 2-arg RPC calls ambiguous).

-- 1. Catalog columns (all nullable / defaulted; existing prices untouched) ---------------------
alter table public.subscription_plans
  add column if not exists intro_price_naira numeric(10,2) check (intro_price_naira is null or intro_price_naira >= 0),
  add column if not exists badge text,
  add column if not exists description text,
  add column if not exists ai_generations integer check (ai_generations is null or ai_generations >= 0);
alter table public.coin_packs add column if not exists badge text;

alter table public.subscriptions
  add column if not exists auto_renew boolean not null default true,
  add column if not exists paystack_email text,
  add column if not exists last_charge_reference text,
  add column if not exists renewal_failures integer not null default 0,
  add column if not exists renewal_failed_at timestamptz;

-- 2. Coupons ------------------------------------------------------------------------------
create table if not exists public.coupon_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  discount_percent integer not null check (discount_percent between 1 and 100),
  valid_days       integer not null default 7 check (valid_days between 1 and 365),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create table if not exists public.user_coupons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  template_id      uuid references public.coupon_templates (id) on delete set null,
  name             text not null,
  discount_percent integer not null check (discount_percent between 1 and 100),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  used_episode_id  uuid references public.episodes (id) on delete set null,
  source           text not null default 'admin',
  created_at       timestamptz not null default now()
);
create index if not exists user_coupons_user_idx on public.user_coupons (user_id, used_at, expires_at);

alter table public.coupon_templates enable row level security;
drop policy if exists coupon_templates_admin on public.coupon_templates;
create policy coupon_templates_admin on public.coupon_templates for all to authenticated using (is_admin()) with check (is_admin());
revoke all on public.coupon_templates from anon;

alter table public.user_coupons enable row level security;
drop policy if exists user_coupons_select_own on public.user_coupons;
create policy user_coupons_select_own on public.user_coupons for select to authenticated using (auth.uid() = user_id or is_admin());
revoke all on public.user_coupons from anon;
revoke insert, update, delete, truncate on public.user_coupons from authenticated;

create or replace function public._grant_coupon(p_user uuid, p_template uuid, p_source text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_t coupon_templates%rowtype; v_id uuid;
begin
  select * into v_t from coupon_templates where id = p_template and is_active;
  if not found then return null; end if;
  insert into user_coupons (user_id, template_id, name, discount_percent, expires_at, source)
  values (p_user, v_t.id, v_t.name, v_t.discount_percent, now() + make_interval(days => v_t.valid_days), p_source)
  returning id into v_id;
  insert into notifications (user_id, type, title, body, metadata)
  values (p_user, 'coupon', 'You got a coupon', v_t.name || ' — valid for ' || v_t.valid_days || ' days.', jsonb_build_object('href', '/tickets'));
  return v_id;
end;
$$;
revoke all on function public._grant_coupon(uuid, uuid, text) from public, anon, authenticated;

-- 3. Member Points ------------------------------------------------------------------------------
create table if not exists public.points_items (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('membership_days', 'reward_coins', 'coupon')),
  name               text not null,
  description        text,
  cost_points        integer not null check (cost_points > 0),
  membership_days    integer check (membership_days is null or membership_days > 0),
  reward_coins       integer check (reward_coins is null or reward_coins > 0),
  coupon_template_id uuid references public.coupon_templates (id) on delete set null,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create table if not exists public.points_redemptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  item_id     uuid references public.points_items (id) on delete set null,
  item_name   text not null,
  cost_points integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists points_redemptions_user_idx on public.points_redemptions (user_id, created_at desc);
create table if not exists public.points_box_opens (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  points     integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.points_items enable row level security;
drop policy if exists points_items_select on public.points_items;
drop policy if exists points_items_admin on public.points_items;
create policy points_items_select on public.points_items for select using (is_active or is_admin());
create policy points_items_admin on public.points_items for all to authenticated using (is_admin()) with check (is_admin());

alter table public.points_redemptions enable row level security;
alter table public.points_box_opens enable row level security;
drop policy if exists points_redemptions_select_own on public.points_redemptions;
drop policy if exists points_box_opens_select_own on public.points_box_opens;
create policy points_redemptions_select_own on public.points_redemptions for select to authenticated using (auth.uid() = user_id or is_admin());
create policy points_box_opens_select_own on public.points_box_opens for select to authenticated using (auth.uid() = user_id or is_admin());
revoke all on public.points_redemptions, public.points_box_opens from anon;
revoke insert, update, delete, truncate on public.points_redemptions, public.points_box_opens from authenticated;

insert into public.points_items (kind, name, description, cost_points, membership_days, reward_coins, sort_order)
select * from (values
  ('membership_days', '1-Day Membership Extension', 'Adds 1 day to your active VIP membership.', 1000, 1, null::int, 10),
  ('membership_days', '3-Day Membership Extension', 'Adds 3 days to your active VIP membership.', 2500, 3, null::int, 20),
  ('reward_coins',    '50 Reward Coins',            'Spend on episode unlocks.',                   500,  null::int, 50, 30)
) v(kind, name, description, cost_points, membership_days, reward_coins, sort_order)
where not exists (select 1 from public.points_items);

-- 4. Payment fulfilment: one idempotent, row-locked path for webhook + verify + renewals ----------------
create or replace function public.fulfill_paystack_transaction(
  p_reference text, p_amount_kobo bigint, p_authorization_code text default null,
  p_reusable boolean default false, p_email text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_txn transactions%rowtype;
  v_type text;
  v_coins bigint;
  v_plan subscription_plans%rowtype;
  v_span interval;
  v_sub subscriptions%rowtype;
  v_sub_id uuid;
begin
  select * into v_txn from transactions where reference = p_reference and type in ('coin_purchase', 'subscription_purchase')
   order by created_at limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_reference'); end if;
  if v_txn.status = 'completed' then return jsonb_build_object('ok', true, 'already', true); end if;
  if v_txn.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  if round(coalesce(v_txn.amount_naira, 0) * 100) <> p_amount_kobo then
    update transactions set status = 'failed', metadata = metadata || jsonb_build_object('failure', 'amount_mismatch', 'paid_kobo', p_amount_kobo) where id = v_txn.id;
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  v_type := v_txn.metadata->>'purchase_type';

  if v_type = 'coins' then
    v_coins := coalesce((v_txn.metadata->>'coins')::bigint, 0);
    insert into wallets (user_id) values (v_txn.user_id) on conflict do nothing;
    update wallets set coin_balance = coin_balance + v_coins where user_id = v_txn.user_id;
    update transactions set status = 'completed', coin_amount = v_coins where id = v_txn.id;
    insert into notifications (user_id, type, title, body, metadata)
    values (v_txn.user_id, 'purchase', 'Coins added', v_coins || ' coins were added to your wallet.', jsonb_build_object('href', '/store'));
    return jsonb_build_object('ok', true, 'kind', 'coins', 'coins', v_coins);

  elsif v_type = 'subscription' then
    select * into v_plan from subscription_plans where id = (v_txn.metadata->>'item_id')::uuid;
    if not found then
      update transactions set status = 'failed', metadata = metadata || jsonb_build_object('failure', 'plan_missing') where id = v_txn.id;
      return jsonb_build_object('ok', false, 'error', 'plan_missing');
    end if;
    v_span := case v_plan."interval" when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '1 year' end;

    if v_txn.metadata ? 'subscription_id' then
      select * into v_sub from subscriptions where id = (v_txn.metadata->>'subscription_id')::uuid for update;
    else
      select * into v_sub from subscriptions
       where user_id = v_txn.user_id and status = 'active' and current_period_end > now()
       order by current_period_end desc limit 1 for update;
    end if;

    if found then
      update subscriptions
         set current_period_end = greatest(current_period_end, now()) + v_span,
             status = 'active', renewal_failures = 0, renewal_failed_at = null, last_charge_reference = p_reference,
             paystack_authorization_code = coalesce(p_authorization_code, paystack_authorization_code),
             paystack_email = coalesce(p_email, paystack_email)
       where id = v_sub.id returning id into v_sub_id;
    else
      insert into subscriptions (user_id, plan_id, status, current_period_start, current_period_end, paystack_authorization_code,
                                 paystack_email, last_charge_reference, auto_renew)
      values (v_txn.user_id, v_plan.id, 'active', now(), now() + v_span,
              case when p_reusable then p_authorization_code end, p_email, p_reference, true)
      returning id into v_sub_id;
    end if;

    update transactions set status = 'completed' where id = v_txn.id;
    insert into notifications (user_id, type, title, body, metadata)
    values (v_txn.user_id, 'purchase',
            case when v_txn.metadata ? 'renewal' then 'Membership renewed' else 'VIP activated' end,
            v_plan.name || ' membership is active.', jsonb_build_object('href', '/store'));
    return jsonb_build_object('ok', true, 'kind', 'subscription', 'subscription_id', v_sub_id);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_purchase_type');
end;
$$;
revoke all on function public.fulfill_paystack_transaction(text, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_paystack_transaction(text, bigint, text, boolean, text) to service_role;

-- 5. Membership --------------------------------------------------------------------------------------------
create or replace function public.get_membership()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); s subscriptions%rowtype; p subscription_plans%rowtype;
begin
  if v_uid is null then return jsonb_build_object('active', false); end if;
  select * into s from subscriptions where user_id = v_uid and status = 'active' and current_period_end > now()
   order by current_period_end desc limit 1;
  if not found then return jsonb_build_object('active', false); end if;
  select * into p from subscription_plans where id = s.plan_id;
  return jsonb_build_object('active', true, 'subscription_id', s.id, 'plan_id', s.plan_id, 'plan_name', p.name,
    'interval', p."interval", 'price_naira', p.price_naira, 'ends_at', s.current_period_end, 'auto_renew', s.auto_renew,
    'canceled_at', s.canceled_at, 'ai_generations', p.ai_generations);
end;
$$;

create or replace function public.cancel_membership()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update subscriptions set auto_renew = false, canceled_at = now()
   where user_id = v_uid and status = 'active' and current_period_end > now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'error', case when v_n = 0 then 'no_active_membership' end);
end;
$$;

create or replace function public.resume_membership()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update subscriptions set auto_renew = true, canceled_at = null
   where user_id = v_uid and status = 'active' and current_period_end > now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'error', case when v_n = 0 then 'no_active_membership' end);
end;
$$;

-- One call for the Store page.
create or replace function public.get_store()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_w wallets%rowtype; v_packs jsonb; v_plans jsonb;
begin
  if v_uid is not null then select * into v_w from wallets where user_id = v_uid; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'coins', coins, 'bonus_coins', bonus_coins,
           'price_naira', price_naira, 'badge', badge) order by sort_order), '[]'::jsonb)
    into v_packs from coin_packs where is_active;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'interval', p."interval", 'price_naira', p.price_naira,
           'intro_price_naira', p.intro_price_naira, 'badge', p.badge, 'description', p.description,
           'ai_generations', p.ai_generations, 'includes_new_releases', p.includes_new_releases,
           'intro_eligible', p.intro_price_naira is not null
                             and (v_uid is null or not exists (select 1 from subscriptions s where s.user_id = v_uid and s.plan_id = p.id))
         ) order by p.sort_order), '[]'::jsonb)
    into v_plans from subscription_plans p where p.is_active;
  return jsonb_build_object('signed_in', v_uid is not null,
    'balances', jsonb_build_object('coins', coalesce(v_w.coin_balance, 0), 'reward_coins', coalesce(v_w.reward_coin_balance, 0)),
    'packs', v_packs, 'plans', v_plans, 'membership', get_membership());
end;
$$;

-- 6. Unlock pricing + unlock (two balances, daily offers, coupons) -------------------------------------------
create or replace function public.get_unlock_price(p_episode_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ep episodes%rowtype; v_t titles%rowtype; v_s platform_settings%rowtype;
  v_list int; v_offer int; v_cid uuid; v_cpct int; v_pct int; v_cost int;
begin
  select * into v_ep from episodes where id = p_episode_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'episode_not_found'); end if;
  select * into v_t from titles where id = v_ep.title_id;
  select * into v_s from platform_settings where id = true;
  v_list := coalesce(v_ep.unlock_cost_coins, v_s.default_episode_unlock_coins);
  select coalesce(max(discount_percent), 0) into v_offer from daily_offers
   where title_id = v_t.id and is_active and now() between starts_at and ends_at;
  if v_uid is not null then
    select id, discount_percent into v_cid, v_cpct from user_coupons
     where user_id = v_uid and used_at is null and expires_at > now()
     order by discount_percent desc, expires_at limit 1;
  end if;
  v_cpct := coalesce(v_cpct, 0);
  v_pct := greatest(v_offer, v_cpct);
  v_cost := ceil(v_list * (100 - v_pct) / 100.0)::int;
  return jsonb_build_object('ok', true,
    'free', v_ep.episode_number <= coalesce(v_t.free_episode_count, v_s.default_free_episodes),
    'vip', v_uid is not null and is_vip(v_uid),
    'list_cost', v_list, 'cost', v_cost, 'discount_percent', v_pct, 'offer_percent', v_offer,
    'coupon_id', case when v_cid is not null and v_cpct >= v_offer then v_cid end, 'coupon_percent', v_cpct);
end;
$$;

drop function if exists public.unlock_episode(uuid, uuid);
create or replace function public.unlock_episode(p_user_id uuid, p_episode_id uuid, p_coupon_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_episode episodes%rowtype;
  v_title titles%rowtype;
  v_settings platform_settings%rowtype;
  v_list_cost int; v_cost int; v_free_count int;
  v_coins bigint; v_reward bigint; v_pay_coins bigint; v_pay_reward bigint;
  v_txn_id uuid; v_creator_share numeric;
  v_has_active_sub boolean; v_episode_is_new_release boolean;
  v_offer_pct int := 0; v_coupon user_coupons%rowtype; v_coupon_pct int := 0; v_pct int := 0; v_use_coupon boolean := false;
begin
  if p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_episode from episodes where id = p_episode_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'episode_not_found'); end if;
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
  select exists (select 1 from subscriptions where user_id = p_user_id and status = 'active' and current_period_end > now())
    into v_has_active_sub;
  if v_has_active_sub and not v_episode_is_new_release then
    insert into episode_unlocks (user_id, episode_id, unlocked_via) values (p_user_id, p_episode_id, 'subscription');
    return jsonb_build_object('ok', true, 'method', 'subscription');
  end if;

  v_list_cost := coalesce(v_episode.unlock_cost_coins, v_settings.default_episode_unlock_coins);
  select coalesce(max(discount_percent), 0) into v_offer_pct from daily_offers
   where title_id = v_title.id and is_active and now() between starts_at and ends_at;

  if p_coupon_id is not null then
    select * into v_coupon from user_coupons
     where id = p_coupon_id and user_id = p_user_id and used_at is null and expires_at > now() for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'coupon_invalid'); end if;
    v_coupon_pct := v_coupon.discount_percent;
  end if;
  -- Best single discount, no stacking. A coupon is only spent when it is the one that applies.
  v_use_coupon := p_coupon_id is not null and v_coupon_pct >= v_offer_pct;
  v_pct := greatest(v_offer_pct, v_coupon_pct);
  v_cost := ceil(v_list_cost * (100 - v_pct) / 100.0)::int;

  insert into wallets (user_id) values (p_user_id) on conflict do nothing;
  select coin_balance, reward_coin_balance into v_coins, v_reward from wallets where user_id = p_user_id for update;
  if v_coins + v_reward < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_coins', 'required', v_cost,
                              'balance', v_coins + v_reward, 'coins', v_coins, 'reward_coins', v_reward);
  end if;

  -- Purchased coins first, then reward coins.
  v_pay_coins := least(v_coins, v_cost);
  v_pay_reward := v_cost - v_pay_coins;
  update wallets set coin_balance = coin_balance - v_pay_coins, reward_coin_balance = reward_coin_balance - v_pay_reward
   where user_id = p_user_id;
  if v_use_coupon then
    update user_coupons set used_at = now(), used_episode_id = p_episode_id where id = v_coupon.id;
  end if;

  insert into transactions (user_id, type, status, coin_amount, related_episode_id, related_title_id, related_creator_id, metadata)
  values (p_user_id, 'episode_unlock', 'completed', -v_cost, p_episode_id, v_title.id, v_title.creator_id,
          jsonb_build_object('list_cost', v_list_cost, 'discount_percent', v_pct, 'paid_coins', v_pay_coins, 'reward_coins', v_pay_reward,
                             'coupon_id', case when v_use_coupon then v_coupon.id end))
  returning id into v_txn_id;

  insert into episode_unlocks (user_id, episode_id, transaction_id, unlocked_via) values (p_user_id, p_episode_id, v_txn_id, 'coins');

  -- Creator is paid on what was actually spent. reward_coin_creator_share (default 1.0) lets the owner
  -- pay less on the platform-funded reward-coin portion.
  v_creator_share := ((v_pay_coins + v_pay_reward * v_settings.reward_coin_creator_share) * v_settings.coin_to_naira) * v_settings.creator_revenue_share;
  if v_creator_share > 0 then
    insert into transactions (user_id, type, status, amount_naira, related_episode_id, related_title_id, related_creator_id)
    values (v_title.creator_id, 'creator_earning', 'completed', v_creator_share, p_episode_id, v_title.id, v_title.creator_id);
    perform credit_creator_earning(v_title.creator_id, v_creator_share);
  end if;

  return jsonb_build_object('ok', true, 'method', 'coins', 'spent', v_cost, 'paid_coins', v_pay_coins,
                            'reward_coins', v_pay_reward, 'discount_percent', v_pct);
end;
$function$;

-- 7. Member Points RPCs ---------------------------------------------------------------------------------------
create or replace function public.crack_daily_box()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_today date := reward_today(); v_s platform_settings%rowtype;
  v_points integer; v_n integer; v_existing integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_s from platform_settings where id = true;
  if v_s.points_box_vip_only and not is_vip(v_uid) then return jsonb_build_object('ok', false, 'error', 'vip_required'); end if;

  insert into points_box_opens (user_id, day, points) values (v_uid, v_today, 0) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select points into v_existing from points_box_opens where user_id = v_uid and day = v_today;
    return jsonb_build_object('ok', false, 'error', 'already_opened', 'points', v_existing);
  end if;

  -- Skewed draw: most opens land low, "up to max" stays possible.
  v_points := greatest(v_s.points_box_min, least(v_s.points_box_max,
              floor(v_s.points_box_min + (v_s.points_box_max - v_s.points_box_min) * power(random(), 3))::integer));
  update points_box_opens set points = v_points where user_id = v_uid and day = v_today;
  perform _credit(v_uid, 'points', v_points, 'daily_box', v_today::text);
  return jsonb_build_object('ok', true, 'points', v_points);
end;
$$;

create or replace function public.redeem_points_item(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_i points_items%rowtype; v_bal bigint; v_sub uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_i from points_items where id = p_item_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'item_unavailable'); end if;

  if v_i.kind = 'membership_days' then
    select id into v_sub from subscriptions where user_id = v_uid and status = 'active' and current_period_end > now()
     order by current_period_end desc limit 1 for update;
    if v_sub is null then return jsonb_build_object('ok', false, 'error', 'vip_required'); end if;
  end if;

  insert into wallets (user_id) values (v_uid) on conflict do nothing;
  select points_balance into v_bal from wallets where user_id = v_uid for update;
  if v_bal < v_i.cost_points then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points', 'required', v_i.cost_points, 'balance', v_bal);
  end if;

  update wallets set points_balance = points_balance - v_i.cost_points where user_id = v_uid;
  insert into reward_ledger (user_id, currency, amount, reason, ref) values (v_uid, 'points', -v_i.cost_points, 'redeem:' || v_i.name, v_i.id::text);

  if v_i.kind = 'membership_days' then
    update subscriptions set current_period_end = current_period_end + make_interval(days => v_i.membership_days) where id = v_sub;
  elsif v_i.kind = 'reward_coins' then
    perform _credit(v_uid, 'reward_coins', v_i.reward_coins, 'redeem:' || v_i.name, v_i.id::text);
  elsif v_i.kind = 'coupon' then
    if _grant_coupon(v_uid, v_i.coupon_template_id, 'points') is null then
      raise exception 'coupon template unavailable';
    end if;
  end if;

  insert into points_redemptions (user_id, item_id, item_name, cost_points) values (v_uid, v_i.id, v_i.name, v_i.cost_points);
  return jsonb_build_object('ok', true, 'item', v_i.name, 'spent', v_i.cost_points);
end;
$$;

create or replace function public.get_points_state()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_today date := reward_today(); v_s platform_settings%rowtype;
  v_pts bigint := 0; v_box integer; v_items jsonb; v_red jsonb;
begin
  select * into v_s from platform_settings where id = true;
  if v_uid is not null then
    select points_balance into v_pts from wallets where user_id = v_uid;
    select points into v_box from points_box_opens where user_id = v_uid and day = v_today;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'item_name', item_name, 'cost_points', cost_points, 'created_at', created_at)
             order by created_at desc), '[]'::jsonb)
      into v_red from (select * from points_redemptions where user_id = v_uid order by created_at desc limit 20) r;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'description', description,
           'cost_points', cost_points, 'membership_days', membership_days, 'reward_coins', reward_coins) order by sort_order, cost_points), '[]'::jsonb)
    into v_items from points_items where is_active;
  return jsonb_build_object('signed_in', v_uid is not null, 'vip', v_uid is not null and is_vip(v_uid), 'points', coalesce(v_pts, 0),
    'box', jsonb_build_object('opened_today', v_box is not null, 'points_today', v_box, 'vip_only', v_s.points_box_vip_only,
                              'min', v_s.points_box_min, 'max', v_s.points_box_max),
    'items', v_items, 'redemptions', coalesce(v_red, '[]'::jsonb));
end;
$$;

-- 8. History + admin helpers ------------------------------------------------------------------------------------
create or replace function public.get_wallet_history(p_limit integer default 50)
returns table (happened_at timestamptz, currency text, amount bigint, reason text)
language sql stable security definer set search_path = public
as $$
  select * from (
    select l.created_at, l.currency, l.amount, l.reason from reward_ledger l where l.user_id = auth.uid()
    union all
    select t.created_at, 'coins', t.coin_amount, 'coin_purchase' from transactions t
     where t.user_id = auth.uid() and t.type = 'coin_purchase' and t.status = 'completed' and t.coin_amount is not null
    union all
    select t.created_at, 'coins', -((t.metadata->>'paid_coins')::bigint), 'episode_unlock' from transactions t
     where t.user_id = auth.uid() and t.type = 'episode_unlock' and coalesce((t.metadata->>'paid_coins')::bigint, 0) > 0
    union all
    select t.created_at, 'reward_coins', -((t.metadata->>'reward_coins')::bigint), 'episode_unlock' from transactions t
     where t.user_id = auth.uid() and t.type = 'episode_unlock' and coalesce((t.metadata->>'reward_coins')::bigint, 0) > 0
  ) x
  order by 1 desc
  limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.admin_grant_currency(p_user_id uuid, p_currency text, p_amount bigint, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;
  if not exists (select 1 from profiles where id = p_user_id) then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if p_currency = 'coins' then
    insert into wallets (user_id) values (p_user_id) on conflict do nothing;
    update wallets set coin_balance = coin_balance + p_amount where user_id = p_user_id;
    insert into transactions (user_id, type, status, coin_amount, metadata)
    values (p_user_id, 'admin_adjustment', 'completed', p_amount, jsonb_build_object('note', p_note, 'by', auth.uid()));
  elsif p_currency in ('reward_coins', 'points') then
    perform _credit(p_user_id, p_currency, p_amount, 'admin:' || coalesce(nullif(p_note, ''), 'grant'), auth.uid()::text);
  else
    return jsonb_build_object('ok', false, 'error', 'bad_currency');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_grant_coupon(p_template_id uuid, p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_n integer := 0; r record;
begin
  if not is_admin() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_user_id is not null then
    if _grant_coupon(p_user_id, p_template_id, 'admin') is not null then v_n := 1; end if;
  else
    for r in select id from profiles loop
      if _grant_coupon(r.id, p_template_id, 'admin_broadcast') is not null then v_n := v_n + 1; end if;
    end loop;
  end if;
  return jsonb_build_object('ok', v_n > 0, 'granted', v_n, 'error', case when v_n = 0 then 'template_unavailable' end);
end;
$$;

-- 9. Grants -------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'cancel_membership()', 'resume_membership()', 'get_membership()', 'unlock_episode(uuid,uuid,uuid)',
    'crack_daily_box()', 'redeem_points_item(uuid)', 'get_wallet_history(integer)',
    'admin_grant_currency(uuid,text,bigint,text)', 'admin_grant_coupon(uuid,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['get_store()', 'get_unlock_price(uuid)', 'get_points_state()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
