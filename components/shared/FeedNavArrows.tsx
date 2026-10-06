// components/shared/FeedNavArrows.tsx
//
// Up / down buttons on the right edge of the centred video column, shown on
// desktop only (touch users swipe). Mirrors TikTok web's feed arrows.

"use client";

import type { RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { scrollFeed } from "@/hooks/useFeedKeyboard";

export function FeedNavArrows({ containerRef }: { containerRef: RefObject<HTMLElement> }) {
  const { t } = useI18n();
  const btn =
    "flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 active:scale-95";
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-1/2 z-20 hidden flex-col items-center justify-center gap-3 desk:flex"
      // Sits just outside the 9:16 column (half its width + a gap), centred on the stage.
      style={{ marginLeft: "calc(min(100dvh * 9 / 32, 50%) + 40px)" }}
    >
      <button type="button" aria-label={t("feed.previous")} onClick={() => scrollFeed(containerRef.current, -1)} className={`pointer-events-auto ${btn}`}>
        <ChevronUp size={26} />
      </button>
      <button type="button" aria-label={t("feed.next")} onClick={() => scrollFeed(containerRef.current, 1)} className={`pointer-events-auto ${btn}`}>
        <ChevronDown size={26} />
      </button>
    </div>
  );
}
