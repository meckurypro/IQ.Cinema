// components/search/SearchIntro.tsx

"use client";

import { useI18n } from "@/hooks/useI18n";

export function SearchIntro({ q }: { q?: string }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-text">
        {q ? t("search.resultsFor", { q }) : t("search.title")}
      </h1>
      <p className="mt-2 text-sm text-muted">{t("search.comingSoon")}</p>
    </>
  );
}
