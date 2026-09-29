"use client";

import { useEffect, useRef, useState } from "react";
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

  // Any CSS transform on an element — even translateY(0) — makes it the
  // containing block for position:fixed descendants, so a fixed bar inside
  // this wrapper (e.g. My List's edit bar) gets glued to the bottom of the
  // *content* instead of the screen. So the content only carries a transform
  // while it's actually displaced: during a pull, and for the short return.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  // Every path back to rest goes through here. `settling` is set in the same
  // batch as pull -> 0, so there is never a render where the transform is
  // dropped before the return animation has run. (Not transitionend to clear
  // it: that doesn't fire if the tab is hidden or motion is reduced, which
  // would leave the transform — and the bug — stuck on.)
  function releasePull() {
    setSettling(true);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettling(false), 250);
    setPull(0);
  }
  const displaced = pull > 0 || settling;

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
      if (pull > 0) releasePull();
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
    const wasDisplaced = pull > 0;
    if (pull >= TRIGGER_DISTANCE) {
      setRefreshing(true);
      setPull(TRIGGER_DISTANCE);
      await onRefresh();
      setRefreshing(false);
    }
    if (wasDisplaced) releasePull();
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
        style={
          displaced
            ? {
                transform: `translateY(${pull}px)`,
                transition: startY.current ? "none" : "transform 200ms ease-out",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
