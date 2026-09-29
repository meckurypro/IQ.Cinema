// components/home/NothingPublished.tsx

"use client";

import { useI18n } from "@/hooks/useI18n";

export function NothingPublished() {
  const { t } = useI18n();
  return (
    <div className="mt-16 px-6 text-center">
      <p className="font-display text-lg text-text">{t("home.nothingPublished")}</p>
      <p className="mt-1.5 text-sm text-muted">{t("home.nothingPublishedBody")}</p>
    </div>
  );
}
