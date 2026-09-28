"use client";

import { useCallback, useEffect, useRef } from "react";

// Frames are captured at 2x the on-screen preview size so they stay sharp
// on high-DPI phones.
const FRAME_W = 180;
const FRAME_H = 320;
const START_DELAY_MS = 2500;
const SEEK_TIMEOUT_MS = 8000;
const MAX_FRAMES = 50;

// Coarse-to-fine capture order: an even spread across the timeline first,
// then progressively fill the gaps, so scrubbing has *something* close by
// almost immediately instead of only the first few seconds.
function captureOrder(n: number) {
  const seen = new Set<number>();
  const out: number[] = [];
  let step = 1;
  while (step * 2 < n) step *= 2;
  for (; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < n; i += step) {
      if (!seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds a storyboard (a strip of small preview frames) in the background
 * while the main video plays, so scrubbing never has to decode anything
 * live. A dedicated capture element seeks ONE frame at a time, waits for
 * each seek to land, and backs off whenever the main video is buffering so
 * it never competes with playback for bandwidth.
 */
export function useStoryboard({
  src,
  duration,
  isMainBusy,
}: {
  src: string | undefined;
  duration: number;
  isMainBusy: () => boolean;
}) {
  const frames = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const intervalRef = useRef(2);
  const countRef = useRef(0);
  const busyRef = useRef(isMainBusy);
  busyRef.current = isMainBusy;

  useEffect(() => {
    frames.current = new Map();
    if (!src || !duration || !Number.isFinite(duration)) return;

    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    const interval = Math.max(2, duration / MAX_FRAMES);
    const n = Math.floor(duration / interval) + 1;
    intervalRef.current = interval;
    countRef.current = n;

    let cancelled = false;

    // Attached to the DOM at a real (1px, near-invisible) size: some mobile
    // browsers stop decoding video that is detached, display:none or 0x0.
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    v.style.cssText =
      "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;";
    v.src = src;
    document.body.appendChild(v);

    function waitFor(event: string, ms: number) {
      return new Promise<boolean>((resolve) => {
        const done = (ok: boolean) => {
          v.removeEventListener(event, onEvent);
          clearTimeout(t);
          resolve(ok);
        };
        const onEvent = () => done(true);
        const t = setTimeout(() => done(false), ms);
        v.addEventListener(event, onEvent, { once: true });
      });
    }

    function capture(idx: number) {
      if (!v.videoWidth) return;
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Cover-crop the source into the 9:16 frame.
      const srcRatio = v.videoWidth / v.videoHeight;
      const dstRatio = FRAME_W / FRAME_H;
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
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, FRAME_W, FRAME_H);
      frames.current.set(idx, canvas);
    }

    (async () => {
      await sleep(START_DELAY_MS);
      if (cancelled) return;
      if (v.readyState < 1) {
        const ok = await waitFor("loadedmetadata", 15000);
        if (!ok || cancelled) return;
      }

      let failures = 0;
      for (const idx of captureOrder(n)) {
        if (cancelled) return;
        // Yield to real playback: don't fetch while the main video is
        // starved for data.
        while (!cancelled && busyRef.current()) await sleep(500);
        if (cancelled) return;

        const seeked = waitFor("seeked", SEEK_TIMEOUT_MS);
        v.currentTime = Math.min(idx * interval, Math.max(0, duration - 0.1));
        const ok = await seeked;
        if (cancelled) return;
        if (ok) {
          capture(idx);
          failures = 0;
        } else if (++failures >= 4) {
          return; // give up quietly; the preview just shows nearest frames
        }
        await sleep(60);
      }
    })();

    return () => {
      cancelled = true;
      v.removeAttribute("src");
      v.load();
      v.remove();
    };
  }, [src, duration]);

  // Nearest captured frame to `time`, or null if nothing is captured yet.
  const getFrame = useCallback((time: number): HTMLCanvasElement | null => {
    const map = frames.current;
    if (!map.size) return null;
    const n = countRef.current;
    const target = Math.round(time / intervalRef.current);
    for (let d = 0; d <= n; d++) {
      const a = map.get(target - d);
      if (a) return a;
      const b = map.get(target + d);
      if (b) return b;
    }
    return null;
  }, []);

  return { getFrame, FRAME_W, FRAME_H };
}
