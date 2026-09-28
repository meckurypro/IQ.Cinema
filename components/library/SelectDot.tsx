// components/library/SelectDot.tsx

import { Check } from "lucide-react";
import clsx from "clsx";

// Round checkbox shown on cards while the list is in edit mode.
export function SelectDot({ selected, className }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
        selected ? "border-pink bg-pink text-white" : "border-white/80 bg-black/30 text-transparent",
        className
      )}
    >
      <Check size={14} strokeWidth={3.5} />
    </span>
  );
}
