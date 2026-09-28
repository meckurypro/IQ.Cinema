"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, RotateCcw, RotateCw } from "lucide-react";
import clsx from "clsx";
import { SB_FRAME_H, SB_FRAME_W, storyboardLayout } from "@/lib/storyboard";

const AUTO_HIDE_MS = 3000;
const DOUBLE_TAP_MS = 280;
const SEEK_SECONDS = 10;
const PREVIEW_W = 90;
const PREVIEW_H = 160;
const STALL_MS = 8000;
const MAX_RECOVERIES = 2;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  autoPlay,
  title,
  synopsis,
  onOpenDetails,
  actionRail,
  backButton,
  onTimeUpdate,
  onEnded,
  onRequestFreshSrc,
  storyboardUrl,
}: {
  src: string | undefined;
  autoPlay?: boolean;
  title?: string;
  synopsis?: string | null;
  onOpenDetails?: () => void;
  actionRail?: React.ReactNode;
  backButton?: React.ReactNode;
  onTimeUpdate?: (seconds: number) => void;
  onEnded?: () => void;
  // Returns a brand-new (e.g. re-signed) URL; used to recover a stalled or
  // expired stream.
  onRequestFreshSrc?: () => Promise<string | undefined>;
  // One JPEG sprite sheet of preview frames (see lib/storyboard.ts).
  storyboardUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSide = useRef<"left" | "right" | null>(null);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const scrubTimeRef = useRef(0);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveries = useRef(0);
  const recovering = useRef(false);
  const stallStage = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [iconPulse, setIconPulse] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [spriteReady, setSpriteReady] = useState(false);
  // { side, seconds } keyed by a counter so retapping the same side while
  // the flash is mid-animation restarts it instead of being ignored.
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right"; key: number } | null>(null);

  // Preload the storyboard sprite once. It is a single small image, so
  // scrubbing never touches the video file at all.
  useEffect(() => {
    spriteRef.current = null;
    setSpriteReady(false);
    if (!storyboardUrl) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      spriteRef.current = img;
      setSpriteReady(true);
    };
    img.src = storyboardUrl;
    return () => {
      img.onload = null;
    };
  }, [storyboardUrl]);

  // Paint the frame nearest `time` out of the sprite into the preview box.
  function drawPreview(time: number) {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = spriteRef.current;
    if (img && duration) {
      const L = storyboardLayout(duration);
      const i = Math.min(L.count - 1, Math.max(0, Math.round(time / L.interval)));
      ctx.drawImage(
        img,
        (i % L.cols) * L.frameW,
        Math.floor(i / L.cols) * L.frameH,
        L.frameW,
        L.frameH,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  useEffect(() => {
    if (dragging) drawPreview(scrubTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, scrubTime, spriteReady]);

  function clearStallTimer() {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }

  function markHealthy() {
    clearStallTimer();
    stallStage.current = 0;
    pendingSeek.current = null;
    setBuffering(false);
  }

  // Two-stage recovery if the element is still starved STALL_MS after a
  // seek / buffering event: first re-issue the seek at the same spot; if
  // that also fails, rebuild the stream there with a freshly signed URL.
  function armStallWatchdog() {
    clearStallTimer();
    stallTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v || (v.readyState >= 3 && !v.seeking)) {
        markHealthy();
        return;
      }
      if (stallStage.current === 0) {
        stallStage.current = 1;
        v.currentTime = pendingSeek.current ?? v.currentTime;
        armStallWatchdog();
        return;
      }
      void recoverStream();
    }, STALL_MS);
  }

  async function recoverStream() {
    const v = videoRef.current;
    if (!v || recovering.current || recoveries.current >= MAX_RECOVERIES) return;
    recovering.current = true;
    recoveries.current += 1;
    const resume = !v.paused || wasPlayingRef.current;
    const at = pendingSeek.current ?? v.currentTime ?? 0;
    try {
      let url = v.currentSrc || src;
      if (onRequestFreshSrc) {
        const fresh = await onRequestFreshSrc();
        if (fresh) url = fresh;
      }
      if (!url) return;
      setBuffering(true);
      const onMeta = () => {
        v.removeEventListener("loadedmetadata", onMeta);
        v.currentTime = at;
        if (resume) v.play().catch(() => {});
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.src = url;
      v.load();
      stallStage.current = 1; // a failed reload goes straight to giving up
      armStallWatchdog();
    } finally {
      recovering.current = false;
    }
  }

  useEffect(() => clearStallTimer, []);

  function clearHideTimer() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }

  function scheduleHide() {
    clearHideTimer();
    if (!videoRef.current || videoRef.current.paused) return;
    hideTimer.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }

  useEffect(() => {
    if (showControls) scheduleHide();
    return clearHideTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls, playing]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function seekBy(seconds: number, side: "left" | "right") {
    const v = videoRef.current;
    if (!v) return;
    const target = Math.min(Math.max(0, v.currentTime + seconds), v.duration || Infinity);
    pendingSeek.current = target;
    v.currentTime = target;
    armStallWatchdog();
    setSeekFlash({ side, key: Date.now() });
    updateProgressUI(v.currentTime, v.duration);
  }

  function updateProgressUI(current: number, total: number) {
    const pct = total ? Math.min(100, (current / total) * 100) : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (currentTimeRef.current) currentTimeRef.current.textContent = formatTime(current);
  }

  // Single tap toggles the control layer (whether playing or paused);
  // a second tap on the same side within the window seeks instead.
  function handleOverlayTap(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const side: "left" | "right" = e.clientX - rect.left < rect.width / 2 ? "left" : "right";

    if (tapTimer.current && tapSide.current === side) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      tapSide.current = null;
      seekBy(side === "left" ? -SEEK_SECONDS : SEEK_SECONDS, side);
      return;
    }

    tapSide.current = side;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      tapSide.current = null;
      setShowControls((v) => !v);
    }, DOUBLE_TAP_MS);
  }

  // While the finger is down we only move the progress UI and the preview
  // frame. The real video is paused and seeked exactly once on release —
  // firing a seek on every pointermove aborts each in-flight range request
  // and leaves the element stuck in a permanent loading state.
  function handleBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const v = videoRef.current;
    draggingRef.current = true;
    wasPlayingRef.current = !!v && !v.paused;
    if (v && !v.paused) v.pause();
    setDragging(true);
    clearHideTimer();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  }

  function scrubTo(clientX: number) {
    const v = videoRef.current;
    const bar = barRef.current;
    if (!v || !bar || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = fraction * v.duration;
    scrubTimeRef.current = time;
    updateProgressUI(time, v.duration);
    setScrubTime(time);

    drawPreview(time);
  }

  function handleBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    scrubTo(e.clientX);
  }

  function handleBarPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const v = videoRef.current;
    if (v) {
      setBuffering(true);
      pendingSeek.current = scrubTimeRef.current;
      v.currentTime = scrubTimeRef.current;
      if (wasPlayingRef.current) v.play().catch(() => {});
      armStallWatchdog();
    }
    scheduleHide();
  }

  return (
    <div className="relative h-full w-full select-none bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay={autoPlay}
        playsInline
        preload="auto"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
          clearHideTimer();
        }}
        onWaiting={() => {
          setBuffering(true);
          armStallWatchdog();
        }}
        onPlaying={() => {
          markHealthy();
          recoveries.current = 0;
        }}
        onCanPlay={markHealthy}
        onSeeked={markHealthy}
        onError={() => {
          setBuffering(true);
          void recoverStream();
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (!draggingRef.current) updateProgressUI(t, e.currentTarget.duration || duration);
          onTimeUpdate?.(t);
        }}
        onEnded={onEnded}
      />

      {/* Tap zones: single tap toggles the control layer, a second tap on
          the same side within the window seeks instead. */}
      <div className="absolute inset-0" onClick={handleOverlayTap} />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 size={36} className="animate-spin text-white/90" />
        </div>
      )}

      {seekFlash && (
        <div
          key={seekFlash.key}
          onAnimationEnd={() => setSeekFlash(null)}
          className={clsx(
            "seek-flash pointer-events-none absolute top-0 flex h-full w-1/2 flex-col items-center justify-center gap-1 text-white",
            seekFlash.side === "left" ? "left-0" : "right-0"
          )}
        >
          {seekFlash.side === "left" ? <RotateCcw size={26} /> : <RotateCw size={26} />}
          <span className="text-[13px] font-semibold">{SEEK_SECONDS}s</span>
        </div>
      )}

      {/* Center play/pause — only when paused, or briefly after a tap
          reveals the control layer. */}
      <div
        className={clsx(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIconPulse((n) => n + 1);
            togglePlay();
          }}
          className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white active:scale-95"
        >
          <span key={iconPulse} className="coin-pop flex items-center justify-center">
            {playing ? <Pause size={26} className="fill-white" /> : <Play size={26} className="fill-white pl-0.5" />}
          </span>
        </button>
      </div>

      {/* Back button — same show/hide behavior as every other overlay. */}
      {backButton && (
        <div
          className={clsx(
            "transition-opacity duration-200",
            showControls ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {backButton}
        </div>
      )}

      {/* Action rail (save/comments/share/episodes) — fades with the rest
          of the controls layer instead of staying pinned on screen. */}
      {actionRail && (
        <div
          className={clsx(
            "transition-opacity duration-200",
            showControls ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {actionRail}
        </div>
      )}

      {/* Bottom panel: title/synopsis, then progress bar + time */}
      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 flex flex-col gap-2 px-4 pb-4 pt-10 transition-opacity duration-200",
          "bg-gradient-to-t from-black/80 via-black/10 to-transparent",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {/* Scrub preview: floating 9:16 frame + timestamp, shown only while
            actively dragging, sitting just above the title. */}
        {dragging && (
          <div
            className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2"
            style={{ bottom: "calc(100% - 20px)" }}
          >
            <canvas
              ref={previewCanvasRef}
              width={SB_FRAME_W}
              height={SB_FRAME_H}
              className="rounded-md border border-white/25 bg-black shadow-card"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
            />
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
              {formatTime(scrubTime)} / {formatTime(duration)}
            </span>
          </div>
        )}

        {(title || synopsis) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails?.();
            }}
            className="pointer-events-auto max-w-[78%] text-left"
          >
            {title && (
              <p className="text-[15px] font-semibold text-white [text-shadow:0_1px_4px_rgb(0_0_0_/_0.6)]">
                {title}
              </p>
            )}
            {synopsis && (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/80 [text-shadow:0_1px_4px_rgb(0_0_0_/_0.6)]">
                {synopsis}
              </p>
            )}
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <span
            ref={currentTimeRef}
            className={clsx(
              "min-w-[34px] text-[11px] font-medium transition-all duration-150",
              dragging ? "scale-110 text-white" : "text-white/90"
            )}
          >
            0:00
          </span>
          <div
            ref={barRef}
            onPointerDown={handleBarPointerDown}
            onPointerMove={handleBarPointerMove}
            onPointerUp={handleBarPointerUp}
            onPointerCancel={handleBarPointerUp}
            className="relative flex h-6 flex-1 touch-none items-center"
          >
            <div
              className={clsx(
                "w-full overflow-hidden rounded-full transition-all duration-150",
                dragging ? "h-2.5 bg-white/60" : "h-1 bg-white/25"
              )}
            >
              <div
                ref={fillRef}
                className={clsx(
                  "h-full rounded-full bg-pink transition-[filter] duration-150",
                  dragging && "brightness-125 saturate-150"
                )}
                style={{ width: "0%" }}
              />
            </div>
            <div
              ref={thumbRef}
              className={clsx(
                "absolute rounded-full bg-white shadow-card transition-all duration-150",
                dragging
                  ? "h-5 w-5 -translate-x-1/2 ring-4 ring-pink/60"
                  : "h-3 w-3 -translate-x-1/2"
              )}
              style={{ left: "0%" }}
            />
          </div>
          <span
            className={clsx(
              "min-w-[34px] text-right text-[11px] font-medium transition-all duration-150",
              dragging ? "scale-110 text-white" : "text-white/90"
            )}
          >
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
