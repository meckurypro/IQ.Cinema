// components/library/SegmentedControl.tsx

"use client";

import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "themed",
}: {
  options: readonly { value: T; label: string; labelKey?: MessageKey }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  // "overlay" is the same control restyled for sitting on top of video (the
  // For You page is always dark, whatever the app theme). Size, type and the
  // sliding-thumb motion are identical.
  tone?: "themed" | "overlay";
}) {
  const { t } = useI18n();
  const overlay = tone === "overlay";
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex h-11 rounded-lg p-1 ${
        overlay ? "bg-black/50 backdrop-blur-md" : "bg-surface-raised"
      }`}
    >
      {/* Sliding thumb: one element that moves, instead of a color swap. */}
      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 rounded-md transition-transform duration-300 ease-out ${
          overlay ? "bg-white/25" : "bg-surface shadow-sm dark:bg-border dark:shadow-none"
        }`}
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 text-[15px] font-semibold transition-colors ${
            option.value === value
              ? overlay
                ? "text-white"
                : "text-text"
              : overlay
                ? "text-white/60"
                : "text-muted"
          }`}
        >
          {option.labelKey ? t(option.labelKey) : option.label}
        </button>
      ))}
    </div>
  );
}
