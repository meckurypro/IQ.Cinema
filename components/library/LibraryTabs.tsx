// components/library/LibraryTabs.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SquarePen } from "lucide-react";
import clsx from "clsx";

export type TopTab = "following" | "history" | "reminders";

const TABS: { value: TopTab; label: string }[] = [
  { value: "following", label: "Following" },
  { value: "history", label: "History" },
  { value: "reminders", label: "Reminder Set" },
];

export function LibraryTabs({
  value,
  onChange,
  editing,
  editDisabled,
  onToggleEdit,
}: {
  value: TopTab;
  onChange: (tab: TopTab) => void;
  editing: boolean;
  editDisabled: boolean;
  onToggleEdit: () => void;
}) {
  const refs = useRef<Record<TopTab, HTMLButtonElement | null>>({
    following: null,
    history: null,
    reminders: null,
  });
  const [center, setCenter] = useState<number | null>(null);

  // Measure the rendered button so the indicator survives font loading and
  // copy changes. Re-measure whenever any tab's box changes size.
  useLayoutEffect(() => {
    const measure = () => {
      const btn = refs.current[value];
      if (btn) setCenter(btn.offsetLeft + btn.offsetWidth / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [value]);

  return (
    <div className="flex items-start justify-between gap-3">
      <div role="tablist" aria-label="My List" className="relative flex gap-6 pb-3">
        {TABS.map(({ value: tab, label }) => (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el;
            }}
            role="tab"
            aria-selected={value === tab}
            onClick={() => onChange(tab)}
            className={clsx(
              "whitespace-nowrap text-[21px] leading-tight transition-colors",
              value === tab ? "font-semibold text-text" : "font-medium text-muted"
            )}
          >
            {label}
          </button>
        ))}
        {center !== null && (
          <span
            aria-hidden
            className="absolute bottom-0 h-[3px] w-7 -translate-x-1/2 rounded-full bg-pink transition-[left] duration-300 ease-out"
            style={{ left: center }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onToggleEdit}
        disabled={editDisabled && !editing}
        aria-label={editing ? "Done editing" : "Edit list"}
        className="-mt-0.5 grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-1 text-text transition-opacity disabled:opacity-30"
      >
        {editing ? (
          <span className="px-2 text-[15px] font-semibold text-pink">Done</span>
        ) : (
          <SquarePen size={24} strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
