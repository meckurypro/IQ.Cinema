// lib/forYouTabs.ts
//
// The four in-page views of the For You feed. Every one is a list of promo
// episodes (episodes.is_promo) — only the ranking differs, and it's done in
// the get_for_you_feed_v2 RPC.
//   for_you     blended relevance (recency + engagement + your genres)
//   new         newest releases first
//   trending    hottest over the last 7 days
//   collections promos filtered by category (Drama / Story / Anime)

export const FOR_YOU_TABS = [
  { key: "for_you", label: "For you", labelKey: "foryou.tab.forYou" },
  { key: "new", label: "New", labelKey: "foryou.tab.new" },
  { key: "trending", label: "Trending", labelKey: "foryou.tab.trending" },
  { key: "collections", label: "Collections", labelKey: "foryou.tab.collections" },
] as const;

export type ForYouTab = (typeof FOR_YOU_TABS)[number]["key"];

export function parseForYouTab(value: string | null | undefined): ForYouTab {
  return FOR_YOU_TABS.some((t) => t.key === value) ? (value as ForYouTab) : "for_you";
}

// What the RPC's p_tab understands. "collections" ranks like For you, just
// scoped by category.
export function rpcTabFor(tab: ForYouTab): "for_you" | "new" | "trending" {
  return tab === "collections" ? "for_you" : tab;
}

// i18n keys (see lib/i18n/messages.ts) — resolved with t() where rendered.
export const EMPTY_COPY_KEY = {
  for_you: "foryou.empty.forYou",
  new: "foryou.empty.new",
  trending: "foryou.empty.trending",
  collections: "foryou.empty.collections",
} as const satisfies Record<ForYouTab, string>;
