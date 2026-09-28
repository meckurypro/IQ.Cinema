import type { SupabaseClient } from "@supabase/supabase-js";

// A storyboard is ONE small JPEG containing a grid of low-res frames from an
// episode. The player draws scrub-preview frames out of it, so scrubbing
// never has to touch the video file (no extra range requests, no extra
// decoders). It is generated once — at upload time, from the creator's local
// file — and stored next to the video's path in the public `thumbnails`
// bucket.

export const STORYBOARD_BUCKET = "thumbnails";
export const SB_FRAME_W = 135; // 1.5x the 90x160 on-screen preview, for sharp phones
export const SB_FRAME_H = 240;
const MAX_FRAMES = 50;
const MAX_COLS = 10;

// Layout is derived from the whole-second duration so the generator (which
// only knows the file) and the player (which only knows the video element)
// always agree without storing any extra metadata.
export function storyboardLayout(durationSeconds: number) {
  const duration = Math.max(1, Math.round(durationSeconds));
  const interval = Math.max(2, duration / MAX_FRAMES);
  const count = Math.max(1, Math.floor(duration / interval) + 1);
  const cols = Math.min(MAX_COLS, count);
  const rows = Math.ceil(count / cols);
  return { duration, interval, count, cols, rows, frameW: SB_FRAME_W, frameH: SB_FRAME_H };
}

// videos/<uid>/<title>/<uuid>.mp4  ->  thumbnails/<uid>/<title>/<uuid>.jpg
export function storyboardPath(videoPath: string) {
  return videoPath.replace(/\.[^./]+$/, "") + ".jpg";
}

export function storyboardPublicUrl(supabase: SupabaseClient, videoPath: string) {
  return supabase.storage.from(STORYBOARD_BUCKET).getPublicUrl(storyboardPath(videoPath)).data
    .publicUrl;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForEvent(el: HTMLVideoElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      el.removeEventListener(event, onEvent);
      reject(new Error(`Timed out waiting for video ${event}`));
    }, ms);
    const onEvent = () => {
      clearTimeout(t);
      resolve();
    };
    el.addEventListener(event, onEvent, { once: true });
  });
}

/**
 * Builds the storyboard JPEG from a video source. Intended for a LOCAL file
 * (a blob: URL from the creator's picked file), where seeks are instant and
 * cost no network. It also works on a remote URL (`remote: true`), used only
 * for the one-off backfill of episodes that were uploaded before this
 * existed — that path is slower because every seek is a network range read.
 */
export async function generateStoryboard(
  src: string,
  opts: { remote?: boolean; onProgress?: (fraction: number) => void } = {}
): Promise<Blob> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  if (opts.remote) v.crossOrigin = "anonymous"; // needed so the canvas can be exported
  // Real (tiny) size, attached to the DOM: some mobile browsers stop
  // decoding frames for detached or 0x0 video.
  v.style.cssText =
    "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
  v.setAttribute("aria-hidden", "true");
  v.src = src;
  document.body.appendChild(v);

  try {
    if (v.readyState < 1) await waitForEvent(v, "loadedmetadata", 20000);
    if (v.readyState < 2) await waitForEvent(v, "loadeddata", 20000);

    const L = storyboardLayout(v.duration);
    const canvas = document.createElement("canvas");
    canvas.width = L.cols * L.frameW;
    canvas.height = L.rows * L.frameH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const dstRatio = L.frameW / L.frameH;
    for (let i = 0; i < L.count; i++) {
      const t = Math.min(i * L.interval, Math.max(0, v.duration - 0.1));
      if (Math.abs(v.currentTime - t) > 0.01) {
        const seeked = waitForEvent(v, "seeked", opts.remote ? 15000 : 8000);
        v.currentTime = t;
        await seeked;
      }
      await sleep(30); // let the frame paint

      const srcRatio = v.videoWidth / v.videoHeight;
      let sx = 0,
        sy = 0,
        sw = v.videoWidth,
        sh = v.videoHeight;
      if (srcRatio > dstRatio) {
        sw = v.videoHeight * dstRatio;
        sx = (v.videoWidth - sw) / 2;
      } else {
        sh = v.videoWidth / dstRatio;
        sy = (v.videoHeight - sh) / 2;
      }
      ctx.drawImage(
        v,
        sx,
        sy,
        sw,
        sh,
        (i % L.cols) * L.frameW,
        Math.floor(i / L.cols) * L.frameH,
        L.frameW,
        L.frameH
      );
      opts.onProgress?.((i + 1) / L.count);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72)
    );
    if (!blob) throw new Error("Couldn't encode the preview image");
    return blob;
  } finally {
    v.removeAttribute("src");
    v.load();
    v.remove();
  }
}

export async function uploadStoryboard(
  supabase: SupabaseClient,
  videoPath: string,
  blob: Blob
) {
  const { error } = await supabase.storage
    .from(STORYBOARD_BUCKET)
    .upload(storyboardPath(videoPath), blob, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "86400",
    });
  if (error) throw error;
}
