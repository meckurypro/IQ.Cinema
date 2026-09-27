// components/watch/ActionRail.tsx

"use client";

import { Bookmark, MessageCircle, Redo2, ListVideo } from "lucide-react";
import clsx from "clsx";
import { formatCount } from "@/lib/format";

function RailButton({
  icon,
  count,
  active,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex flex-col items-center gap-1.5 text-white transition-transform active:scale-90"
    >
      <span
        className={clsx(
          "flex h-10 w-10 items-center justify-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
          active && "scale-105"
        )}
      >
        {icon}
      </span>
      {count !== undefined && (
        <span className="text-[12px] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

export function ActionRail({
  saved,
  saveCount,
  onToggleSave,
  commentCount,
  onOpenComments,
  shareCount,
  onShare,
  onOpenEpisodes,
  episodeNumber,
}: {
  saved: boolean;
  saveCount: number;
  onToggleSave: () => void;
  commentCount: number;
  onOpenComments: () => void;
  shareCount: number;
  onShare: () => void;
  onOpenEpisodes: () => void;
  episodeNumber: number;
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 z-20 flex flex-col items-center gap-5"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)" }}
    >
      <RailButton
        icon={<Bookmark size={30} className={saved ? "fill-gold text-gold" : "text-white"} />}
        count={saveCount}
        active={saved}
        label={saved ? "Remove from My List" : "Save to My List"}
        onClick={onToggleSave}
      />
      <RailButton
        icon={<MessageCircle size={29} className="text-white" />}
        count={commentCount}
        label="View comments"
        onClick={onOpenComments}
      />
      <RailButton
        icon={<Redo2 size={29} className="text-white" />}
        count={shareCount}
        label="Share"
        onClick={onShare}
      />
      <RailButton
        icon={<ListVideo size={28} className="text-white" />}
        label={`Episode ${episodeNumber} — episode list`}
        onClick={onOpenEpisodes}
      />
    </div>
  );
}
