// lib/reportPlay.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeviceId } from "@/lib/device";

export type PlayReport = {
  userId: string | null;
  episodeId: string;
  /** Cumulative seconds actually watched in the current playback session. */
  watchedSeconds: number;
};

// Server-side record_play validates and rate-limits everything; this is the
// single client entry point so the feeds don't each carry their own copy.
export async function reportPlay(supabase: SupabaseClient, report: PlayReport) {
  if (typeof document !== "undefined" && document.hidden) return;
  const deviceId = getDeviceId();
  if (!report.userId && !deviceId) return;

  const { data, error } = await supabase.rpc("record_play", {
    p_user_id: report.userId,
    p_device_id: deviceId || null,
    p_episode_id: report.episodeId,
    p_watched_seconds: Math.max(0, Math.floor(report.watchedSeconds)),
  });

  if (error) {
    console.error("record_play failed", error.message);
    return;
  }
  if (data && data.ok === false) {
    console.warn("record_play rejected", data.error);
  }
}
