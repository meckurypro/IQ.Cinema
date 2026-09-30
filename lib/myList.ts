// lib/myList.ts

import type { Category } from "@/lib/categories";
import type { MessageKey } from "@/lib/i18n/messages";

// One row of public.get_my_list(). Keep in sync with
// supabase/migrations/20260928000000_my_list.sql.
export type ListKind = "following" | "history" | "reminders_released" | "reminders_upcoming";

export type MyListItem = {
  title_id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  is_exclusive: boolean;
  category: Category;
  status: string;
  tags: string[];
  total_episodes: number;
  last_episode_number: number;
  resume_episode_id: string | null;
  is_following: boolean;
  has_reminder: boolean;
  has_new_episode: boolean;
  activity_at: string;
};

export function watchHref(item: Pick<MyListItem, "resume_episode_id" | "slug">) {
  return item.resume_episode_id ? `/watch/${item.resume_episode_id}` : `/title/${item.slug}`;
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function progressLabel(
  item: Pick<MyListItem, "last_episode_number" | "total_episodes">,
  t: Translate
) {
  const total = Math.max(item.total_episodes, item.last_episode_number);
  return `${t("common.epShort", { n: item.last_episode_number })}/${t("common.epShort", { n: total })}`;
}

// Postgres timestamptz can arrive with microseconds and a "+00" offset, which
// Safari's Date parser rejects. Normalize before parsing.
function parseTimestamp(value: string) {
  const iso = value
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso);
}

export function dayLabel(value: string, t: Translate, locale?: string, now = new Date()) {
  const d = parseTimestamp(value);
  if (Number.isNaN(d.getTime())) return t("date.earlier");
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return t("date.today");
  if (diffDays === 1) return t("date.yesterday");
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// Preserves the incoming (newest-first) order.
export function groupByDay(items: MyListItem[], t: Translate, locale?: string) {
  const groups: { label: string; items: MyListItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.activity_at, t, locale);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
