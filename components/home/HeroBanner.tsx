"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";

type HeroTitle = {
  slug: string;
  title: string;
  poster_url: string | null;
  banner_url: string | null;
  genre_label?: string | null;
  // Tapping the poster goes straight into episode 1's player, skipping the
  // synopsis/"Watch now" gate — falls back to the title page for a title
  // with no published episodes yet (e.g. coming soon).
  first_episode_id?: string | null;
};

function heroHref(t: HeroTitle) {
  return t.first_episode_id ? `/watch/${t.first_episode_id}` : `/title/${t.slug}`;
}

export function HeroBanner({
  featured,
  exclusive,
}: {
  featured: HeroTitle | null;
  exclusive: HeroTitle | null;
}) {
  const { t } = useI18n();
  if (!featured) return null;

  return (
    <div className="mt-4 flex gap-2 px-4 desk:gap-4 desk:px-0">
      <Link
        href={heroHref(featured)}
        className="group relative aspect-[9/16] flex-[2] overflow-hidden rounded-lg bg-surface-raised desk:aspect-[16/7] desk:flex-[3] desk:rounded-xl"
      >
        {(featured.banner_url ?? featured.poster_url) && (
          <Image
            src={featured.banner_url ?? featured.poster_url!}
            alt={featured.title}
            fill
            sizes="(min-width: 768px) 60vw, 360px"
            priority
            className="object-cover object-top transition-transform duration-500 desk:group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 desk:p-6">
          {featured.genre_label && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-gold">
              {featured.genre_label}
            </p>
          )}
          <p className="line-clamp-1 text-[15px] font-semibold text-white desk:text-[28px]">{featured.title}</p>
        </div>
      </Link>

      {exclusive && (
        <Link
          href={heroHref(exclusive)}
          className="group relative aspect-[9/16] flex-1 overflow-hidden rounded-lg bg-surface-raised desk:aspect-auto desk:rounded-xl"
        >
          {(exclusive.banner_url ?? exclusive.poster_url) && (
            <Image
              src={exclusive.banner_url ?? exclusive.poster_url!}
              alt={exclusive.title}
              fill
              sizes="(min-width: 768px) 25vw, 180px"
              className="object-cover transition-transform duration-500 desk:group-hover:scale-[1.03]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-pink px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {t("home.exclusive")}
          </span>
          <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-2 text-[12px] font-medium leading-tight text-white">
            {exclusive.title}
          </p>
        </Link>
      )}
    </div>
  );
}
