// components/watch/ActionRail.tsx

"use client";

import { Bookmark, Heart, MessageCircle, Layers, Forward } from "lucide-react";
import clsx from "clsx";
import { formatCount } from "@/lib/format";

function RailButton({
  icon,
  count,
  label,
  showLabel,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  count?: number;
  label: string;
  // Save/Like show a running count under the icon; Episodes/Share show the
  // action name instead — matches the reference layout.
  showLabel?: boolean;
  active?: boolean;
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
          "flex h-11 w-11 items-center justify-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
          active && "scale-105"
        )}
      >
        {icon}
      </span>
      <span className="text-[12.5px] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
        {showLabel ? label : formatCount(count ?? 0)}
      </span>
    </button>
  );
}

export function ActionRail({
  saved,
  saveCount,
  onToggleSave,
  liked,
  likeCount,
  onToggleLike,
  commentCount,
  onOpenComments,
  shareCount,
  onShare,
  onOpenEpisodes,
}: {
  saved: boolean;
  saveCount: number;
  onToggleSave: () => void;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  commentCount: number;
  onOpenComments: () => void;
  shareCount: number;
  onShare: () => void;
  onOpenEpisodes: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 z-20 flex flex-col items-center gap-5"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 124px)" }}
    >
      <RailButton
        icon={<Bookmark size={38} className={saved ? "fill-gold text-gold" : "text-white"} />}
        count={saveCount}
        active={saved}
        label={saved ? "Remove from My List" : "Save to My List"}
        onClick={onToggleSave}
      />
      <RailButton
        icon={<Heart size={38} className={liked ? "fill-pink text-pink" : "text-white"} />}
        count={likeCount}
        active={liked}
        label={liked ? "Unlike" : "Like"}
        onClick={onToggleLike}
      />
      <RailButton
        icon={<MessageCircle size={36} className="text-white" />}
        count={commentCount}
        label="View comments"
        onClick={onOpenComments}
      />
      <RailButton
        icon={<Layers size={34} className="text-white" />}
        label="Episodes"
        showLabel
        onClick={onOpenEpisodes}
      />
      <RailButton
        icon={<Forward size={34} className="text-white" />}
        count={shareCount}
        label="Share"
        showLabel
        onClick={onShare}
      />
    </div>
  );
}
