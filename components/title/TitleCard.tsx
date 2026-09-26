// components/title/TitleCard.tsx

import Image from "next/image";
import Link from "next/link";
import { Flame } from "lucide-react";
import clsx from "clsx";

export type TitleCardData = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  total_unique_views: number;
  is_exclusive: boolean;
  genre_label?: string;
};

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TitleCard({ title, size = "md" }: { title: TitleCardData; size?: "sm" | "md" }) {
  const width = size === "sm" ? "w-28" : "w-36";

  return (
    <Link href={`/title/${title.slug}`} className={clsx("shrink-0 group", width)}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-raised">
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.title}
            fill
            sizes="180px"
            className="object-cover transition-transform duration-300 group-active:scale-95"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted text-xs">No poster</div>
        )}

        {title.is_exclusive && (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Exclusive
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1.5 pt-4 text-[11px] text-white/90">
          <Flame size={11} className="fill-gold text-gold" />
          {formatViews(title.total_unique_views)}
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-text">
        {title.title}
      </p>
      {title.genre_label && (
        <p className="mt-0.5 text-[11px] text-muted">{title.genre_label}</p>
      )}
    </Link>
  );
}
