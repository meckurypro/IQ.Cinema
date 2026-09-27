"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, RotateCcw, RotateCw } from "lucide-react";
import clsx from "clsx";

const AUTO_HIDE_MS = 3000;
const DOUBLE_TAP_MS = 280;
const SEEK_SECONDS = 10;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  autoPlay,
  onTimeUpdate,
  onEnded,
}: {
  src: string | undefined;
  autoPlay?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSide = useRef<"left" | "right" | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [iconPulse, setIconPulse] = useState(0);
  // { side, seconds } keyed by a counter so retapping the same side while
  // the flash is mid-animation restarts it instead of being ignored.
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right"; key: number } | null>(null);

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
    v.currentTime = Math.min(Math.max(0, v.currentTime + seconds), v.duration || Infinity);
    setSeekFlash({ side, key: Date.now() });
    updateProgressUI(v.currentTime, v.duration);
  }

  function updateProgressUI(current: number, total: number) {
    const pct = total ? Math.min(100, (current / total) * 100) : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
    if (currentTimeRef.current) currentTimeRef.current.textContent = formatTime(current);
  }

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

  function handleBarPointerDown(e: React.PointerEvent) {
    setDragging(true);
    clearHideTimer();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  }

  function scrubTo(clientX: number) {
    const v = videoRef.current;
    const bar = barRef.current;
    if (!v || !bar || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = fraction * v.duration;
    v.currentTime = time;
    updateProgressUI(time, v.duration);
  }

  function handleBarPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    scrubTo(e.clientX);
  }

  function handleBarPointerUp() {
    setDragging(false);
    scheduleHide();
  }

  return (
    <div className="relative h-full w-full select-none bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay={autoPlay}
        playsInline
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
          clearHideTimer();
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (!dragging) updateProgressUI(t, e.currentTarget.duration || duration);
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

      {/* Bottom progress bar + time */}
      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 flex items-center gap-2.5 px-4 pb-4 pt-8 transition-opacity duration-200",
          "bg-gradient-to-t from-black/80 via-black/10 to-transparent",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <span ref={currentTimeRef} className="min-w-[34px] text-[11px] font-medium text-white/90">
          0:00
        </span>
        <div
          ref={barRef}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          onPointerCancel={handleBarPointerUp}
          className="relative flex h-4 flex-1 touch-none items-center"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
            <div ref={fillRef} className="h-full rounded-full bg-pink" style={{ width: "0%" }} />
          </div>
          <div
            ref={thumbRef}
            className={clsx(
              "absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-card transition-transform",
              dragging && "scale-125"
            )}
            style={{ left: "0%" }}
          />
        </div>
        <span className="min-w-[34px] text-right text-[11px] font-medium text-white/90">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
