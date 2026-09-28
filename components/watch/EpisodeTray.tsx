// components/watch/EpisodeTray.tsx

"use client";

import Link from "next/link";
import { Lock, Play, Check } from "lucide-react";
import clsx from "clsx";
import { BottomSheet } from "@/components/shared/BottomSheet";

export type TrayEpisode = {
  id: string;
  episode_number: number;
  name: string | null;
  unlock_cost_coins: number | null;
};

export function EpisodeTray({
  open,
  onClose,
  episodes,
  currentEpisodeId,
  freeCount,
  unlockedIds,
  defaultCost,
}: {
  open: boolean;
  onClose: () => void;
  episodes: TrayEpisode[];
  // Absent when opened from the title page, where nothing is playing yet.
  currentEpisodeId?: string;
  freeCount: number;
  unlockedIds: Set<string>;
  defaultCost: number;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Episodes · ${episodes.length}`}>
      <div className="grid grid-cols-4 gap-2.5 px-3 pb-3 pt-1 sm:grid-cols-5">
        {episodes.map((ep) => {
          const isFree = ep.episode_number <= freeCount;
          const isPaidUnlocked = unlockedIds.has(ep.id);
          const isUnlocked = isFree || isPaidUnlocked;
          const isCurrent = ep.id === currentEpisodeId;
          const cost = ep.unlock_cost_coins ?? defaultCost;

          return (
            <Link
              key={ep.id}
              href={`/watch/${ep.id}`}
              onClick={onClose}
              aria-current={isCurrent}
              className={clsx(
                "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border text-[13px] font-semibold transition-colors",
                isCurrent
                  ? "border-transparent bg-gradient-to-r from-pink to-crimson text-white"
                  : isUnlocked
                  ? "border-border bg-surface-raised text-text active:bg-border/60"
                  : "border-border bg-surface-raised text-muted active:bg-border/60"
              )}
            >
              {isCurrent ? (
                <Play size={11} className="fill-white" />
              ) : isUnlocked ? (
                isPaidUnlocked && <Check size={11} className="text-gold" />
              ) : (
                <Lock size={11} />
              )}
              <span>{ep.episode_number}</span>
              {!isUnlocked && !isCurrent && (
                <span className="text-[9px] font-normal text-muted">{cost}c</span>
              )}
            </Link>
          );
        })}

        {!episodes.length && (
          <p className="col-span-4 py-6 text-center text-sm text-muted sm:col-span-5">
            No episodes published yet.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
