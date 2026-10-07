// lib/upload/format.ts — small display helpers for the upload UI.

export function formatBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return "0 MB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function formatSpeed(bps: number): string {
  return bps > 0 ? `${formatBytes(bps)}/s` : "—";
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m ${sec}s` : `${m}m ${sec}s`;
}
