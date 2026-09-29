// lib/rewards.ts
// Types mirror public.get_rewards_state()'s jsonb shape.
// See supabase/migrations/20260928192119_rewards_core.sql.

export type TaskStatus = "available" | "claimable" | "done";
export type TaskKind =
  | "login"
  | "email"
  | "whatsapp"
  | "notifications"
  | "social"
  | "watch_time"
  | "reserve"
  | "ad"
  | "checkin_ad";

export type RewardTask = {
  key: string;
  kind: TaskKind;
  title: string;
  description: string | null;
  reward_coins: number;
  daily_cap: number;
  threshold_seconds: number | null;
  action_url: string | null;
  sort_order: number;
  done_count: number;
  visited: boolean;
  progress_seconds: number | null;
  status: TaskStatus;
};

export type DailyOffer = {
  id: string;
  title_id: string;
  title: string;
  slug: string;
  poster_url: string | null;
  category: string;
  genre: string | null;
  discount_percent: number;
  ends_at: string;
};

export type RewardsState = {
  signed_in: boolean;
  today: string;
  balances: { coins: number; reward_coins: number; points: number };
  vip: boolean;
  streak: {
    current: number;
    checked_in_today: boolean;
    today_index: number;
    schedule: { day_index: number; coins: number }[];
  };
  tasks: RewardTask[];
  offers: DailyOffer[];
  ads_available: boolean;
  watch_seconds: number;
};

export function taskCtaLabel(t: Pick<RewardTask, "kind" | "status">) {
  if (t.status === "done") return "Done";
  if (t.kind === "ad" || t.kind === "checkin_ad") return "Watch";
  if (t.kind === "watch_time") return t.status === "claimable" ? "Claim" : "Watch";
  return t.status === "claimable" ? "Claim" : "Go";
}

export function taskProgressLabel(t: Pick<RewardTask, "kind" | "done_count" | "daily_cap">) {
  if (t.kind === "ad" || t.kind === "checkin_ad") return `(${t.done_count}/${t.daily_cap})`;
  if (t.kind === "reserve") return `(${t.done_count}/${t.daily_cap})`;
  return "";
}
