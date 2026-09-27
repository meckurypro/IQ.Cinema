"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

const TRIGGER_DISTANCE = 68;
const MAX_PULL = 110;

// Plain touch events + a translateY, no library. Only engages when the page
// is already scrolled to the top, so it never fights a normal scroll
// gesture — and it never fires on non-touch input, so there's nothing here
// for a mouse/trackpad user to trip over.
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    // These pages scroll the document (no inner overflow container), so the
    // wrapper div's own scrollTop would always read 0 regardless of actual
    // scroll position — check the page's scroll position instead, or this
    // would hijack a normal scroll gesture partway down the page.
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: each extra pixel of finger movement buys less and less
    // travel, so the indicator eases toward MAX_PULL instead of tracking
    // the finger 1:1 and feeling like it could stretch forever.
    const eased = MAX_PULL * (1 - Math.exp(-delta / MAX_PULL));
    setPull(eased);
  }

  async function handleTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= TRIGGER_DISTANCE) {
      setRefreshing(true);
      setPull(TRIGGER_DISTANCE);
      await onRefresh();
      setRefreshing(false);
    }
    setPull(0);
  }

  const progress = Math.min(1, pull / TRIGGER_DISTANCE);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden"
        style={{ height: pull, transition: startY.current ? "none" : "height 200ms ease-out" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center self-end rounded-full bg-surface text-muted shadow-card"
          style={{
            opacity: progress,
            transform: `scale(${0.6 + 0.4 * progress})`,
          }}
        >
          <RefreshCw
            size={16}
            className={clsx(refreshing && "animate-spin", progress >= 1 && !refreshing && "text-pink")}
            style={!refreshing ? { transform: `rotate(${progress * 300}deg)` } : undefined}
          />
        </div>
      </div>

      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: startY.current ? "none" : "transform 200ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
