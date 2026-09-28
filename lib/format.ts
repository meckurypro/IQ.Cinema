// lib/format.ts

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// "1 episode", "12 episodes". Singular for anything below 2.
export function formatEpisodeCount(n: number) {
  return `${n} ${n < 2 ? "episode" : "episodes"}`;
}
