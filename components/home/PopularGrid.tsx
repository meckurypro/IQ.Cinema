// components/home/PopularGrid.tsx

"use client";

import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { PopularCard, type PopularCardData } from "./PopularCard";

export function PopularGrid({
  headingKey,
  headingGenre,
  titles,
}: {
  headingKey: MessageKey;
  headingGenre?: string;
  titles: PopularCardData[];
}) {
  const { t } = useI18n();

  if (!titles.length) {
    return (
      <div className="mt-8 px-6 text-center">
        <p className="text-sm text-muted">{t("home.nothingHere")}</p>
      </div>
    );
  }

  return (
    <section className="mt-6 px-4 desk:mt-8 desk:px-0">
      <h2 className="font-display mb-3 text-[19px] font-semibold text-text desk:mb-5 desk:text-[24px]">
        {t(headingKey, { genre: headingGenre ?? "" })}
      </h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 desk:grid-cols-4 desk:gap-x-5 desk:gap-y-8 xl:grid-cols-6">
        {titles.map((title, i) => (
          <PopularCard key={title.id} title={title} rank={i + 1} />
        ))}
      </div>
    </section>
  );
}
