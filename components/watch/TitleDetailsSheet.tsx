// components/watch/TitleDetailsSheet.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet, markSheetNavigating } from "@/components/shared/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCount } from "@/lib/format";
import { useI18n } from "@/hooks/useI18n";

type SimilarTitle = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
};

export function TitleDetailsSheet({
  open,
  onClose,
  titleId,
  title,
  synopsis,
  views,
  contentRating,
  posterUrl,
  similarHref,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string | undefined;
  title: string;
  synopsis: string | null;
  views: number;
  contentRating?: string | null;
  posterUrl?: string | null;
  // Default sends a similar-title tap to its title page. For You overrides
  // this so the tap stays inside the feed with that title's promo playing —
  // same sheet, different exit ("onion").
  similarHref?: (t: SimilarTitle) => string;
}) {
  const { t } = useI18n();
  const supabase = createClient();
  const [tags, setTags] = useState<string[] | null>(null);
  const [similar, setSimilar] = useState<SimilarTitle[] | null>(null);

  const load = useCallback(async () => {
    if (!titleId) return;
    const [{ data: titleRow }, { data: genreRows }, { data: similarRows }] = await Promise.all([
      supabase.from("titles").select("genre").eq("id", titleId).single(),
      supabase.from("title_genres").select("genres(name)").eq("title_id", titleId),
      supabase.rpc("similar_titles", { p_title_id: titleId, p_limit: 8 }),
    ]);
    // Primary genre first, then the creator's extra tags, no duplicates.
    const extra = ((genreRows ?? []) as unknown as { genres: { name: string } | null }[])
      .map((r) => r.genres?.name)
      .filter((n): n is string => !!n);
    setTags(Array.from(new Set([titleRow?.genre, ...extra].filter((n): n is string => !!n))));
    setSimilar((similarRows as SimilarTitle[]) ?? []);
  }, [titleId, supabase]);

  // Re-fetch every time the sheet opens — tags/similar titles may have
  // changed since it was last shown.
  useEffect(() => {
    if (open) {
      setTags(null);
      setSimilar(null);
      load();
    }
  }, [open, load]);

  return (
    <BottomSheet open={open} onClose={onClose} title={t("watch.details")}>
      <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
        <div className="flex gap-3">
          {posterUrl && (
            <div className="relative aspect-[3/4] w-[88px] shrink-0 overflow-hidden rounded-md bg-surface-raised">
              <Image src={posterUrl} alt={title} fill sizes="88px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[17px] font-semibold text-text">{title}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
              <Eye size={13} />
              {t("watch.views", { n: formatCount(views) })}
            </p>
            {contentRating && (
              <span className="mt-2 inline-block rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {contentRating}
              </span>
            )}
          </div>
        </div>
        {synopsis && <p className="text-[14px] leading-relaxed text-text/85">{synopsis}</p>}

        {tags === null ? (
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
        ) : tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-raised px-3 py-1 text-[12px] font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div>
          <h4 className="mb-2 text-[14px] font-semibold text-text">{t("watch.moreLikeThis")}</h4>
          {similar === null ? (
            <div className="flex gap-2.5 overflow-x-auto">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-[86px] shrink-0 rounded-md" />
              ))}
            </div>
          ) : similar.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {similar.map((t) => (
                <Link
                  key={t.id}
                  href={similarHref ? similarHref(t) : `/title/${t.slug}`}
                  replace
                  onClick={() => markSheetNavigating()}
                  className="w-[86px] shrink-0"
                >
                  <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-surface-raised">
                    {t.poster_url && (
                      <Image src={t.poster_url} alt={t.title} fill className="object-cover" />
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] font-medium text-text">{t.title}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-2 text-[13px] text-muted">{t("watch.nothingSimilar")}</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
