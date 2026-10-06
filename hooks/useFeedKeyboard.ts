// hooks/useFeedKeyboard.ts
//
// Desktop keyboard control for the vertical video feeds (For You and Watch),
// modelled on how TikTok's web player behaves:
//   ↑ / ↓ (or K / J)  previous / next video
//   Space             play / pause
//   ← / →             seek 10s back / forward
//   M                 mute / unmute
// Only one <video> is ever mounted at a time in these feeds (inactive slides
// render a still frame), so the shortcuts act on the first <video> found.
// Ignored while typing, while a sheet/modal has locked page scroll, or when
// a modifier key is held (so browser shortcuts keep working).

"use client";

import { useEffect, type RefObject } from "react";

const SEEK = 10;

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function scrollFeed(container: HTMLElement | null, direction: 1 | -1) {
  if (!container) return;
  container.scrollBy({ top: direction * container.clientHeight, behavior: "smooth" });
}

export function useFeedKeyboard(containerRef: RefObject<HTMLElement>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // Sheets lock background scroll; don't drive the feed underneath one.
      if (document.body.style.overflow === "hidden") return;

      const video = document.querySelector("video");
      const onButton = e.target instanceof HTMLElement && !!e.target.closest("button, a, [role='tab']");

      switch (e.key) {
        case "ArrowDown":
        case "j":
        case "J":
          e.preventDefault();
          scrollFeed(containerRef.current, 1);
          break;
        case "ArrowUp":
        case "k":
        case "K":
          e.preventDefault();
          scrollFeed(containerRef.current, -1);
          break;
        case " ":
          if (!video || onButton) return;
          e.preventDefault();
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
          break;
        case "ArrowRight":
          if (!video) return;
          e.preventDefault();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SEEK);
          break;
        case "ArrowLeft":
          if (!video) return;
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - SEEK);
          break;
        case "m":
        case "M":
          if (!video) return;
          video.muted = !video.muted;
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [containerRef, enabled]);
}
