// lib/upload/videoMeta.ts
//
// Reads a video's duration and pixel size in the browser, without uploading
// it. The old version waited on loadedmetadata/error forever: a file the
// browser can neither decode nor reject (some HEVC/MOV on desktop Chrome, a
// stalled network drive) left the page on "Checking video…" with every button
// disabled. This one gives up after a timeout and says why.

import type { VideoMeta } from "@/lib/uploadTypes";

export class VideoReadError extends Error {
  constructor(public reason: "unreadable" | "timeout") {
    super(reason);
    this.name = "VideoReadError";
  }
}

export function readVideoMetadata(file: File, timeoutMs = 20_000): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new VideoReadError("timeout"))), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const { duration, videoWidth: width, videoHeight: height } = video;
      finish(() => {
        if (!isFinite(duration) || duration <= 0 || !width || !height) reject(new VideoReadError("unreadable"));
        else resolve({ duration, width, height });
      });
    };
    video.onerror = () => finish(() => reject(new VideoReadError("unreadable")));
    video.src = url;
  });
}
