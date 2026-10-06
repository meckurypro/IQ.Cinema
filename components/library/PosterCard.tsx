// components/library/PosterCard.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { progressLabel, watchHref, type MyListItem } from "@/lib/myList";
import { useI18n } from "@/hooks/useI18n";

// Grid card for the Following and Reminder tabs.
export function PosterCard({
  item,
  upcoming = false,
}: {
  item: MyListItem;
  // Coming-soon titles have nothing to resume: link to the title page and
  // show a status line instead of episode progress.
  upcoming?: boolean;
}) {
  const { t } = useI18n();
  const label = item.tags[0];

  const body = (
    <>
      <div
        className={clsx(
          "relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-raised"
        )}
      >
        {item.poster_url ? (
          <Image
            src={item.poster_url}
            alt={item.title}
            fill
            sizes="(min-width: 1280px) 16vw, (min-width: 768px) 18vw, 150px"
            className="object-cover transition-transform duration-300 group-active:scale-95 desk:group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">{t("common.poster.none")}</div>
        )}

        {item.is_exclusive && (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {t("title.exclusive")}
          </span>
        )}

        {item.has_new_episode && (
          <span className="absolute right-0 top-0 rounded-bl-lg bg-gradient-to-r from-orange-500 to-pink px-2 py-1 text-[12px] font-bold leading-none text-white">
            {t("library.newEp")}
          </span>
        )}

        {label && (
          <span className="absolute bottom-1.5 left-1.5 max-w-[78%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {label}
          </span>
        )}

      </div>

      <p className="mt-2 truncate text-[14px] font-semibold text-text">{item.title.trim()}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">{upcoming ? t("title.comingSoon") : progressLabel(item, t)}</p>
    </>
  );

  return (
    <Link href={upcoming ? `/title/${item.slug}` : watchHref(item)} className="group min-w-0">
      {body}
    </Link>
  );
}
