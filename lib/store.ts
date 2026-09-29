// lib/store.ts
// Mirrors public.get_store()'s jsonb shape. See
// supabase/migrations/20260929021153_store_vip_coupons_points.sql.

export type CoinPack = {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_naira: number;
  badge: string | null;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  interval: "weekly" | "monthly" | "annual";
  price_naira: number;
  intro_price_naira: number | null;
  badge: string | null;
  description: string | null;
  ai_generations: number | null;
  includes_new_releases: boolean;
  intro_eligible: boolean;
};

export type Membership = {
  active: boolean;
  subscription_id?: string;
  plan_id?: string;
  plan_name?: string;
  interval?: "weekly" | "monthly" | "annual";
  price_naira?: number;
  ends_at?: string;
  auto_renew?: boolean;
  canceled_at?: string | null;
  ai_generations?: number | null;
};

export type StoreState = {
  signed_in: boolean;
  balances: { coins: number; reward_coins: number };
  packs: CoinPack[];
  plans: SubscriptionPlan[];
  membership: Membership;
};
