// components/library/LibraryTabs.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

export type TopTab = "following" | "history" | "reminders";

const TABS: { value: TopTab; label: string }[] = [
  { value: "following", label: "Following" },
  { value: "history", label: "History" },
  { value: "reminders", label: "Reminder Set" },
];

// Same type and colours as the Home tabs (components/home/CategoryTabs.tsx).
// At that size the three titles take ~330px, so this row holds nothing else.
export function LibraryTabs({
  value,
  onChange,
}: {
  value: TopTab;
  onChange: (tab: TopTab) => void;
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
    // On phones narrower than the titles need (~330px) the strip scrolls
    // inside itself instead of widening the whole page — a page wider than
    // the screen is what made the bottom nav drift out of view.
    <div
      role="tablist"
      aria-label="My List"
      className="no-scrollbar relative flex gap-4 overflow-x-auto pb-3 pt-1 min-[375px]:gap-5"
    >
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
            "shrink-0 whitespace-nowrap text-[16px] font-extrabold uppercase tracking-wide transition-colors",
            value === tab ? "text-text" : "text-muted"
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
  );
}
