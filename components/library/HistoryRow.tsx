// components/library/HistoryRow.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { progressLabel, watchHref, type MyListItem } from "@/lib/myList";
import { useI18n } from "@/hooks/useI18n";

// Horizontal row for the History tab. The bookmark on the right follows or
// unfollows the title without leaving the list.
export function HistoryRow({
  item,
  onToggleFollow,
}: {
  item: MyListItem;
  onToggleFollow: () => void;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <div className="relative aspect-[3/4] w-[88px] shrink-0 overflow-hidden rounded-lg bg-surface-raised">
        {item.poster_url ? (
          <Image src={item.poster_url} alt={item.title} fill sizes="88px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted">{t("common.poster.none")}</div>
        )}
        {item.is_following && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-gradient-to-r from-orange-500 to-pink px-2 py-1 text-[11px] font-bold leading-none text-white">
            {t("library.following")}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 py-1">
        <p className="line-clamp-2 text-[17px] font-semibold leading-snug text-text">
          {item.title.trim()}
        </p>
        <p className="mt-1 text-[13.5px] text-muted">{progressLabel(item, t)}</p>
        {item.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-surface-raised px-2 py-1 text-[12px] font-medium text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-3">
      <Link href={watchHref(item)} className="flex min-w-0 flex-1 gap-3.5">
        {content}
      </Link>

      <button
        type="button"
        onClick={onToggleFollow}
        aria-pressed={item.is_following}
        aria-label={item.is_following ? t("title.unfollow") : t("title.follow")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors active:bg-surface-raised"
      >
        <span key={String(item.is_following)} className="coin-pop">
          <Bookmark
            size={28}
            strokeWidth={1.75}
            className={item.is_following ? "fill-pink text-pink" : "text-muted"}
          />
        </span>
      </button>
    </div>
  );
}
