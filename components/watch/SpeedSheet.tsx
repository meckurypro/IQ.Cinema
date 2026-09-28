// components/watch/SpeedSheet.tsx

"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { BottomSheet } from "@/components/shared/BottomSheet";

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function SpeedSheet({
  open,
  onClose,
  speed,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  speed: number;
  onSelect: (speed: number) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Playback speed">
      <div className="flex flex-col pb-1">
        {PLAYBACK_SPEEDS.map((s) => {
          const active = s === speed;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                onSelect(s);
                onClose();
              }}
              className={clsx(
                "mx-2 flex items-center justify-between rounded-md px-3.5 py-3 text-[15px] transition-colors active:bg-surface-raised",
                active ? "font-semibold text-pink" : "text-text"
              )}
            >
              {s === 1 ? "Normal" : `${s}x`}
              {active && <Check size={17} />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
