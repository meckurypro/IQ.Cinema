"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";

export type PopularCardData = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  // Tapping the card goes straight into episode 1's player, skipping the
  // synopsis/"Watch now" gate — falls back to the title page when a title
  // has no published episodes yet.
  first_episode_id?: string | null;
};

export function PopularCard({ title, rank }: { title: PopularCardData; rank: number }) {
  const { t } = useI18n();
  const href = title.first_episode_id ? `/watch/${title.first_episode_id}` : `/title/${title.slug}`;
  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-surface-raised">
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.title}
            fill
            sizes="(min-width: 1280px) 16vw, (min-width: 768px) 22vw, 240px"
            className="object-cover transition-transform duration-300 group-active:scale-95 desk:group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">{t("common.poster.none")}</div>
        )}
        <span className="absolute right-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
          Hot
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-text">
        {title.title}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-pink">Daily list No. {rank}</p>
    </Link>
  );
}
