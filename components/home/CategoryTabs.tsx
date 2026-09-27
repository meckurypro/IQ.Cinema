// components/home/CategoryTabs.tsx

"use client";

import { useState } from "react";
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

  return (
    <div className="flex items-center gap-5 px-4 pt-4">
      {staticTabs.map(({ key, label }) => {
        const active = activeTab === key;
        return (
          <Link
            key={key}
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
