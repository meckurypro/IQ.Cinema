// components/foryou/ForYouHeader.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import clsx from "clsx";
import { CATEGORIES, type Category } from "@/lib/categories";
import { SegmentedControl } from "@/components/library/SegmentedControl";
import { FOR_YOU_TABS, type ForYouTab } from "@/lib/forYouTabs";
import { useI18n } from "@/hooks/useI18n";

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
  category: Category;
  onCategoryChange: (category: Category) => void;
  onSearch: () => void;
}) {
  const { t } = useI18n();
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
          <div role="tablist" aria-label={t("foryou.title")} className="relative flex w-max items-center gap-4 pb-2">
            {FOR_YOU_TABS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                ref={(el) => {
                  refs.current[key] = el;
                }}
                role="tab"
                onClick={() => onTabChange(key)}
                aria-selected={tab === key}
                className={clsx(
                  "shrink-0 text-[15px] font-extrabold uppercase tracking-wide transition-colors",
                  tab === key ? "text-white" : "text-white/60"
                )}
              >
                {t(labelKey)}
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
          aria-label={t("common.search")}
          className="pointer-events-auto -mt-2 flex h-8 w-8 shrink-0 items-center justify-center text-white"
        >
          <Search size={19} />
        </button>
      </div>

      {tab === "collections" && (
        // Same control (and options) as My List's category filter.
        <div className="pointer-events-auto mt-1">
          <SegmentedControl
            ariaLabel={t("foryou.collection")}
            tone="overlay"
            options={CATEGORIES}
            value={category}
            onChange={onCategoryChange}
          />
        </div>
      )}
    </div>
  );
}
