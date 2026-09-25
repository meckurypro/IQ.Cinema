import Link from "next/link";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

export const GENRES = ["Live-Action", "Fantasy", "Romance", "Historical", "Modern", "Revenge"];

const staticTabs = [
  { key: "popular", label: "Popular" },
  { key: "new", label: "New" },
  { key: "ranking", label: "Ranking" },
] as const;

export function CategoryTabs({
  activeTab,
  activeGenre,
}: {
  activeTab: string;
  activeGenre?: string;
}) {
  const isGenreActive = activeTab === "genre";

  return (
    <div className="flex items-center gap-5 px-4 pt-4">
      {staticTabs.map(({ key, label }) => {
        const active = activeTab === key;
        return (
          <Link
            key={key}
            href={key === "popular" ? "/" : `/?tab=${key}`}
            className={clsx(
              "text-[15px] font-semibold transition-colors",
              active ? "text-pink" : "text-muted"
            )}
          >
            {label}
          </Link>
        );
      })}

      <details className="group relative ml-auto">
        <summary
          className={clsx(
            "flex cursor-pointer list-none items-center gap-1 text-[15px] font-semibold transition-colors",
            isGenreActive ? "text-pink" : "text-muted"
          )}
        >
          {isGenreActive && activeGenre ? activeGenre : "Genres"}
          <ChevronDown size={16} />
        </summary>

        <div className="absolute right-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {GENRES.map((genre) => (
            <Link
              key={genre}
              href={`/?tab=genre&genre=${encodeURIComponent(genre)}`}
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
        </div>
      </details>
    </div>
  );
}
