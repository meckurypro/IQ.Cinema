// components/title/TitleMeta.tsx

"use client";

import { useI18n } from "@/hooks/useI18n";
import { formatEpisodeCount } from "@/lib/format";

export function TitleMeta({
  contentRating,
  status,
  episodeCount,
}: {
  contentRating: string | null;
  status: string;
  episodeCount: number;
}) {
  const { t } = useI18n();
  return (
    <p className="mt-1 text-[13px] text-muted">
      {contentRating} ·{" "}
      {status === "coming_soon" ? t("title.comingSoon") : formatEpisodeCount(episodeCount, t)}
    </p>
  );
}
