// supabase/functions/transcode-episode/index.ts
//
// Invoked automatically by a DB trigger (trigger_transcode_episode) the
// instant an episode's status transitions to 'processing'. This is what
// was missing before: nothing ever moved an episode off 'processing', so
// uploads sat there forever. This function owns that state machine.
//
// INTEGRATION POINT: real video transcoding (renditions, adaptive bitrate,
// thumbnail extraction) requires an actual media pipeline - e.g. Mux,
// Cloudflare Stream, or a self-hosted ffmpeg worker - which isn't wired up
// in this project. That call belongs where marked below. Until it's added,
// this function does everything else for real: confirms the uploaded file
// actually exists in storage (duration/aspect ratio were already enforced
// at write time by the validate_episode_media DB trigger), then reliably
// flips status to 'published' on success or back to 'draft' with
// processing_error set on failure - so nothing is ever silently stuck.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  let episodeId: string | undefined;
  try {
    const body = await req.json();
    episodeId = body.episode_id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!episodeId) {
    return new Response(JSON.stringify({ error: "Missing episode_id" }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: episode, error: fetchErr } = await supabase
    .from("episodes")
    .select("id, video_url, status")
    .eq("id", episodeId)
    .single();

  if (fetchErr || !episode) {
    return new Response(JSON.stringify({ error: "Episode not found" }), { status: 404 });
  }

  // Idempotency guard: only act if it's still actually awaiting processing.
  // Protects against a duplicate/retried trigger delivery double-processing
  // the same row.
  if (episode.status !== "processing") {
    return new Response(JSON.stringify({ ok: true, skipped: true, status: episode.status }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!episode.video_url) {
      throw new Error("No video file attached");
    }

    // Confirm the object really made it to storage before publishing anything.
    const videoPath = episode.video_url as string;
    const lastSlash = videoPath.lastIndexOf("/");
    const folder = videoPath.slice(0, lastSlash);
    const filename = videoPath.slice(lastSlash + 1);
    const { data: listing, error: listErr } = await supabase.storage
      .from("videos")
      .list(folder, { search: filename });
    const found = listing?.some((f) => f.name === filename);
    if (listErr || !found) {
      throw new Error("Uploaded video file could not be found in storage");
    }

    // ------------------------------------------------------------------
    // INTEGRATION POINT: call the real transcoding/media provider here,
    // e.g.:
    //   const asset = await fetch("https://api.mux.com/video/v1/assets", {...});
    // and either await the result or handle its completion webhook before
    // publishing. Not present in this project yet.
    // ------------------------------------------------------------------

    const { error: updateErr } = await supabase
      .from("episodes")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", episodeId);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ ok: true, episode_id: episodeId, status: "published" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    await supabase
      .from("episodes")
      .update({ status: "draft", processing_error: message })
      .eq("id", episodeId);

    return new Response(JSON.stringify({ ok: false, episode_id: episodeId, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
