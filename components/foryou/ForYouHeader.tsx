// components/foryou/ForYouHeader.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import clsx from "clsx";
import { CATEGORIES } from "@/lib/categories";
import { FOR_YOU_TABS, type ForYouTab } from "@/lib/forYouTabs";

// All four tabs switch the feed in place — no navigation. Collections adds a
// category chip row (All / Drama / Story / Anime) under the strip.
export function ForYouHeader({
  tab,
  onTabChange,
  category,
  onCategoryChange,
  onSearch,
}: {
  tab: ForYouTab;
  onTabChange: (tab: ForYouTab) => void;
  category: string | null;
  onCategoryChange: (category: string | null) => void;
  onSearch: () => void;
}) {
  // Same measured-underline treatment as Home (CategoryTabs) and My List
  // (LibraryTabs): measure the active tab's box instead of hard-coding an
  // offset so it stays lined up if the label or font changes.
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [center, setCenter] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[tab];
      if (el) setCenter(el.offsetLeft + el.offsetWidth / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [tab]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-3"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      <div className="flex items-center gap-3">
        {/* Scrolls sideways on very narrow phones rather than clipping. */}
        <div className="no-scrollbar pointer-events-auto min-w-0 flex-1 overflow-x-auto">
          <div className="relative flex w-max items-center gap-4 pb-2">
            {FOR_YOU_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                ref={(el) => {
                  refs.current[key] = el;
                }}
                onClick={() => onTabChange(key)}
                aria-pressed={tab === key}
                className={clsx(
                  "shrink-0 text-[15px] font-extrabold uppercase tracking-wide transition-colors",
                  tab === key ? "text-white" : "text-white/60"
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
        </div>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="pointer-events-auto -mt-2 flex h-8 w-8 shrink-0 items-center justify-center text-white"
        >
          <Search size={19} />
        </button>
      </div>

      {tab === "collections" && (
        <div className="no-scrollbar pointer-events-auto -mx-4 mt-1 flex gap-2 overflow-x-auto px-4">
          {[{ value: null, label: "All" }, ...CATEGORIES.map((c) => ({ value: c.value as string, label: c.label }))].map(
            ({ value, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => onCategoryChange(value)}
                aria-pressed={category === value}
                className={clsx(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                  category === value ? "bg-white text-black" : "bg-black/45 text-white/85"
                )}
              >
                {label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
