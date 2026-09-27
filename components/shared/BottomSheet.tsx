"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

// Drag-to-dismiss bottom sheet. Pointer events only (no gesture library) —
// this is the one interaction on mobile where a snap-back animation
// genuinely needs to react to velocity, not just distance, so it's worth
// the bit of hand-rolled physics below. Everything else in the app should
// stay plain CSS.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(
    null
  );

  // Portal target only exists client-side.
  useEffect(() => setMounted(true), []);

  // Lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function runClose() {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setDragY(0);
      onClose();
    }, 200);
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Only the drag handle / header should start a drag, so text selection
    // and taps on content inside the sheet aren't hijacked.
    dragState.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    const dt = e.timeStamp - dragState.current.lastT || 1;
    dragState.current.velocity = (e.clientY - dragState.current.lastY) / dt;
    dragState.current.lastY = e.clientY;
    dragState.current.lastT = e.timeStamp;
    setDragY(Math.max(0, delta));
  }

  function handlePointerUp() {
    if (!dragState.current) return;
    const { velocity } = dragState.current;
    dragState.current = null;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 300;
    // Dismiss on either a fast downward flick or dragging past a third of
    // the sheet's own height — matches how iOS/Android sheets feel, rather
    // than a fixed pixel threshold that's wrong for short vs tall sheets.
    if (velocity > 0.5 || dragY > sheetHeight / 3) {
      runClose();
    } else {
      setDragY(0);
    }
  }

  if (!mounted || (!open && !closing)) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        onClick={runClose}
        className={clsx(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          closing ? "opacity-0" : "opacity-100"
        )}
      />
      <div
        ref={sheetRef}
        className={clsx(
          "absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-xl border-t border-border bg-surface shadow-card",
          !closing && dragY === 0 && "sheet-up"
        )}
        style={{
          transform: `translateY(${closing ? "100%" : `${dragY}px`})`,
          transition: dragState.current ? "none" : "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex cursor-grab touch-none flex-col items-center pt-2.5 pb-1 active:cursor-grabbing"
        >
          <div className="h-1 w-9 rounded-full bg-border" />
          {title && (
            <p className="mt-2 pb-1 text-[15px] font-semibold text-text">{title}</p>
          )}
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-1 pb-2">{children}</div>
      </div>
    </div>,
    document.body
  );
}
