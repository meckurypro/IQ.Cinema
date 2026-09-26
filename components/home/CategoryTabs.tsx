// components/home/CategoryTabs.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any click outside it, or on Escape.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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
              active ? "text-text" : "text-white/55"
            )}
          >
            {label}
          </Link>
        );
      })}

      <div ref={containerRef} className="relative ml-auto">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={clsx(
            "flex cursor-pointer items-center gap-1 text-[16px] font-extrabold uppercase tracking-wide transition-colors",
            isGenreActive ? "text-text" : "text-white/55"
          )}
        >
          {isGenreActive && activeGenre ? activeGenre : "Genres"}
          <ChevronDown size={17} strokeWidth={3} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-md border border-border bg-surface shadow-card">
            {genres.map((genre) => (
              <Link
                key={genre}
                href={`/?tab=genre&genre=${encodeURIComponent(genre)}`}
                onClick={() => setOpen(false)}
                className={clsx(
                  "block px-3.5 py-2.5 text-sm",
                  isGenreActive && activeGenre === genre
                    ? "bg-pink/10 font-semibold text-pink"
                    : "text-text"
                )}
              >
                {genre}
              </Link>
            ))}
            {!genres.length && (
              <p className="px-3.5 py-2.5 text-sm text-muted">No genres yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
