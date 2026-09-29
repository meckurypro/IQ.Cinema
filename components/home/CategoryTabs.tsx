// components/home/CategoryTabs.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { BottomSheet } from "@/components/shared/BottomSheet";

const staticTabs = [
  { key: "popular", label: "Popular" },
  { key: "new", label: "New" },
  { key: "ranking", label: "Ranking" },
] as const;

export function CategoryTabs({
  activeTab,
  activeGenre,
  genres,
}: {
  activeTab: string;
  activeGenre?: string;
  genres: string[];
}) {
  const isGenreActive = activeTab === "genre";
  const [open, setOpen] = useState(false);

  // Same underline treatment as My List's tabs (components/library/LibraryTabs.tsx):
  // measure the active tab's rendered box rather than hard-coding an offset,
  // so it survives font loading and copy changes.
  const activeKey = isGenreActive ? "genre" : activeTab;
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [center, setCenter] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[activeKey];
      if (el) setCenter(el.offsetLeft + el.offsetWidth / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [activeKey]);

  return (
    <div className="relative flex items-center gap-5 px-4 pb-3 pt-4">
      {staticTabs.map(({ key, label }) => {
        const active = activeTab === key;
        return (
          <Link
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            href={key === "popular" ? "/" : `/?tab=${key}`}
            className={clsx(
              "text-[16px] font-extrabold uppercase tracking-wide transition-colors",
              active ? "text-text" : "text-muted"
            )}
          >
            {label}
          </Link>
        );
      })}

      <button
        ref={(el) => {
          refs.current.genre = el;
        }}
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "ml-auto flex cursor-pointer items-center gap-1 text-[16px] font-extrabold uppercase tracking-wide transition-colors",
          isGenreActive ? "text-text" : "text-muted"
        )}
      >
        Genres
        <ChevronDown size={17} strokeWidth={3} />
      </button>

      {center !== null && (
        <span
          aria-hidden
          className="absolute bottom-0 h-[3px] w-7 -translate-x-1/2 rounded-full bg-pink transition-[left] duration-300 ease-out"
          style={{ left: center }}
        />
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Genres">
        <div className="flex flex-col pb-1">
          {genres.map((genre) => (
            <Link
              key={genre}
              href={`/?tab=genre&genre=${encodeURIComponent(genre)}`}
              onClick={() => setOpen(false)}
              className={clsx(
                "mx-2 rounded-md px-3.5 py-3 text-[15px] transition-colors active:bg-surface-raised",
                isGenreActive && activeGenre === genre
                  ? "font-semibold text-pink"
                  : "text-text"
              )}
            >
              {genre}
            </Link>
          ))}
          {!genres.length && (
            <p className="px-5 py-3 text-sm text-muted">No genres yet</p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
