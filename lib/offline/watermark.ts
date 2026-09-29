// lib/offline/watermark.ts
//
// Burns the app-icon watermark permanently into a downloaded episode's video
// bytes, using ffmpeg compiled to WASM and run entirely in the browser — no
// video-processing backend to stand up or operate. This only touches the
// on-device (IndexedDB) copy used for offline playback (see ./manager); the
// live streaming player keeps its own lightweight CSS overlay, unchanged.
//
// Uses the single-threaded ffmpeg core (no SharedArrayBuffer / cross-origin-
// isolation headers required), self-hosted from /public/ffmpeg (see
// scripts/copy-ffmpeg-core.mjs) rather than a third-party CDN, since this is
// processing someone's private video. Only one encode runs at a time — a
// second concurrent download that finishes mid-encode just waits its turn
// on the same ffmpeg instance instead of racing it.

import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;
let logoBytesPromise: Promise<Uint8Array> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadFFmpeg(): Promise<FFmpeg> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
    toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
  ]);
  await ffmpeg.load({ coreURL, wasmURL });
  return ffmpeg;
}

async function loadLogoBytes(): Promise<Uint8Array> {
  const { fetchFile } = await import("@ffmpeg/util");
  return fetchFile("/watermark.png");
}

// Runs `task` after every previously-queued watermark job has finished,
// whether it succeeded or failed — the shared ffmpeg instance can only run
// one exec() at a time.
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export class WatermarkUnsupportedError extends Error {}

// Overlays /public/watermark.png bottom-left (matching the live player's
// CSS overlay position) at ~12% of the frame width, re-encodes as H.264/AAC
// mp4. `onProgress` receives 0..1. Throws WatermarkUnsupportedError if this
// browser can't run the WASM core (caller should fall back to the plain
// download rather than fail it outright).
export async function watermarkVideo(
  input: Blob,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  return enqueue(async () => {
    let ffmpeg: FFmpeg;
    try {
      ffmpegPromise ??= loadFFmpeg();
      ffmpeg = await ffmpegPromise;
    } catch (err) {
      ffmpegPromise = null;
      throw new WatermarkUnsupportedError(err instanceof Error ? err.message : "ffmpeg failed to load");
    }

    logoBytesPromise ??= loadLogoBytes();
    const logoBytes = await logoBytesPromise;

    const { fetchFile } = await import("@ffmpeg/util");
    const inputName = `in-${Date.now()}.mp4`;
    const outputName = `out-${Date.now()}.mp4`;

    const onLog = ({ message }: { message: string }) => {
      // ffmpeg.wasm has no native "on complete of exec()" progress event
      // that's reliable across inputs missing duration metadata, so this is
      // left purely informational; real progress comes from the 'progress'
      // event below when available.
      void message;
    };
    const onProgressEvent = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) onProgress?.(Math.min(1, Math.max(0, progress)));
    };
    ffmpeg.on("log", onLog);
    ffmpeg.on("progress", onProgressEvent);

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(input));
      await ffmpeg.writeFile("logo.png", logoBytes);

      await ffmpeg.exec([
        "-i", inputName,
        "-i", "logo.png",
        "-filter_complex",
        "[1:v][0:v]scale2ref=w=main_w*0.12:h=main_w*0.12[wm][base];" +
          "[wm]format=rgba,colorchannelmixer=aa=0.55[wm2];" +
          "[base][wm2]overlay=x=main_w*0.03:y=main_h-h-main_h*0.05:format=auto[outv]",
        "-map", "[outv]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      // Re-wrap: ffmpeg.wasm's typings allow a SharedArrayBuffer-backed
      // view here, which BlobPart doesn't accept even though the runtime
      // value never actually is one on the single-threaded core.
      return new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" });
    } finally {
      ffmpeg.off("log", onLog);
      ffmpeg.off("progress", onProgressEvent);
      await Promise.all(
        [inputName, "logo.png", outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {}))
      );
    }
  });
}
