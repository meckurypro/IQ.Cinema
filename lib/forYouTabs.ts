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
  { key: "for_you", label: "For you" },
  { key: "new", label: "New" },
  { key: "trending", label: "Trending" },
  { key: "collections", label: "Collections" },
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

export const EMPTY_COPY: Record<ForYouTab, string> = {
  for_you: "Nothing on For You yet — check back once creators have set a promo episode.",
  new: "No new releases yet — fresh promos will land here first.",
  trending: "Nothing is trending yet — watch and share a promo to get it moving.",
  collections: "No promos in this collection yet.",
};
