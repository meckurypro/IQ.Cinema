// lib/format.ts

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// "1 episode", "12 episodes". Singular for anything below 2. Takes the
// translator from useI18n() so the label follows the selected language.
export function formatEpisodeCount(
  n: number,
  t: (key: "common.episode" | "common.episodes", vars?: Record<string, string | number>) => string
) {
  return t(n < 2 ? "common.episode" : "common.episodes", { n });
}

// 754 -> "12:34"
export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
