// components/watch/PlayerTopBar.tsx

"use client";

import { ArrowLeft, Gauge, MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import { useI18n } from "@/hooks/useI18n";

export function PlayerTopBar({
  episodeNumber,
  onBack,
  onOpenTitle,
  speed,
  onOpenSpeed,
  onOpenMore,
  visible = true,
}: {
  episodeNumber: number;
  onBack: () => void;
  // Tapping the EP badge doubles as the old "open details" affordance —
  // title/synopsis now live in the player's bottom overlay.
  onOpenTitle?: () => void;
  speed: number;
  onOpenSpeed: () => void;
  onOpenMore: () => void;
  visible?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={clsx(
        "absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onOpenTitle}
          className="rounded-full bg-black/50 px-3 py-1.5 text-[13px] font-bold tracking-wide text-white"
        >
          EP.{episodeNumber}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSpeed}
          className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[13px] font-semibold text-white"
        >
          <Gauge size={15} />
          {speed === 1 ? t("watch.speed") : `${speed}x`}
        </button>
        <button
          type="button"
          onClick={onOpenMore}
          aria-label={t("watch.moreOptions")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
