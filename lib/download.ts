// lib/download.ts

import type { SupabaseClient } from "@supabase/supabase-js";

// Triggers a real file download of a private-bucket video: the signed URL
// is minted with `download` set, which makes Supabase Storage answer with a
// Content-Disposition: attachment header, so the browser saves the file
// instead of trying to play it inline. Plain <a download> alone doesn't
// force this for a cross-origin (storage) URL, so we depend on this header
// rather than the anchor attribute.
//
// NOTE ON WATERMARKING: this downloads the source file as stored. Burning
// the app-icon watermark permanently into the downloaded file (not just the
// on-screen player) requires re-encoding the video server-side (an ffmpeg
// overlay pass), which is a background-processing job this change doesn't
// add. The in-player watermark is real; the downloaded file is not
// re-encoded yet.
export async function downloadEpisodeVideo(
  supabase: SupabaseClient,
  videoPath: string,
  fileName: string
) {
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(videoPath, 60 * 5, { download: fileName });
  if (error || !data?.signedUrl) throw error ?? new Error("Could not prepare download");
  window.location.href = data.signedUrl;
}
