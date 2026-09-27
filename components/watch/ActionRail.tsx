// components/watch/ActionRail.tsx

"use client";

import { Heart, Bookmark, MessageCircle, Share2, ListVideo } from "lucide-react";
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
      className="pointer-events-auto flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
    >
      <span
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition-colors",
          active && "bg-black/45"
        )}
      >
        {icon}
      </span>
      {count !== undefined && (
        <span className="text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

export function ActionRail({
  liked,
  likeCount,
  onToggleLike,
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
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
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
      className="pointer-events-none absolute right-2.5 z-20 flex flex-col items-center gap-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)" }}
    >
      <RailButton
        icon={<Heart size={22} className={liked ? "fill-crimson text-crimson" : "text-white"} />}
        count={likeCount}
        active={liked}
        label={liked ? "Unlike" : "Like"}
        onClick={onToggleLike}
      />
      <RailButton
        icon={<Bookmark size={21} className={saved ? "fill-gold text-gold" : "text-white"} />}
        count={saveCount}
        active={saved}
        label={saved ? "Remove from My List" : "Save to My List"}
        onClick={onToggleSave}
      />
      <RailButton
        icon={<MessageCircle size={21} className="text-white" />}
        count={commentCount}
        label="View comments"
        onClick={onOpenComments}
      />
      <RailButton
        icon={<Share2 size={20} className="text-white" />}
        count={shareCount}
        label="Share"
        onClick={onShare}
      />
      <RailButton
        icon={<ListVideo size={20} className="text-white" />}
        label={`Episode ${episodeNumber} — episode list`}
        onClick={onOpenEpisodes}
      />
    </div>
  );
}
