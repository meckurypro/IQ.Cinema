// lib/settings.ts
// Mirrors public.user_settings. Defaults here MUST match the column defaults in
// supabase/migrations/*_rewards_core.sql — the DB creates a row for every user
// (backfilled + trigger on profiles), so these only apply to guests and to the
// split second before the row loads.

export type UserSettings = {
  language: string;
  autoplay_next: boolean;
  notify_new_episodes: boolean;
  notify_rewards: boolean;
  notify_promos: boolean;
  push_permission: "default" | "granted" | "denied";
  whatsapp_number: string | null;
};

// Settings a client may write. whatsapp_number is deliberately absent: it can
// only be set through the link_whatsapp() RPC (validated + unique), and a DB
// trigger discards direct writes to it.
export type SettingsPatch = Partial<Omit<UserSettings, "whatsapp_number">>;

export const DEFAULT_SETTINGS: UserSettings = {
  language: "en",
  autoplay_next: true, // on by default
  notify_new_episodes: true, // on by default
  notify_rewards: true, // on by default
  notify_promos: false, // marketing is opt-in
  push_permission: "default",
  whatsapp_number: null,
};

export const SETTINGS_COLUMNS =
  "language, autoplay_next, notify_new_episodes, notify_rewards, notify_promos, push_permission, whatsapp_number";
