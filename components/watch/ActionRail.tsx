// components/watch/ActionRail.tsx

"use client";

import { Bookmark, MessageCircle, Layers } from "lucide-react";
import { ShareIcon } from "@/components/watch/ShareIcon";
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
  // Save/Comments show a running count under the icon; Share/Episodes show
  // the action name instead.
  showLabel?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex flex-col items-center gap-0.5 text-white transition-transform active:scale-90"
    >
      <span
        className={clsx(
          "flex h-9 w-9 items-center justify-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
          active && "scale-105"
        )}
      >
        {icon}
      </span>
      <span className="text-[12px] font-semibold leading-none text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
        {showLabel ? label : formatCount(count ?? 0)}
      </span>
    </button>
  );
}

// Compact stack in the lower third of the screen, right side.
// Order: Save, Comments, Share, Episodes (Episodes always last / lowest).
export function ActionRail({
  saved,
  saveCount,
  onToggleSave,
  commentCount,
  onOpenComments,
  shareCount,
  onShare,
  onOpenEpisodes,
}: {
  saved: boolean;
  saveCount: number;
  onToggleSave: () => void;
  commentCount: number;
  onOpenComments: () => void;
  shareCount: number;
  onShare: () => void;
  onOpenEpisodes: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 z-20 flex flex-col items-center gap-1"
      style={{ bottom: "var(--rail-bottom, calc(env(safe-area-inset-bottom, 0px) + 96px))" }}
    >
      <RailButton
        icon={<Bookmark size={32} className={saved ? "fill-gold text-gold" : "text-white"} />}
        count={saveCount}
        active={saved}
        label={saved ? "Remove from My List" : "Save to My List"}
        onClick={onToggleSave}
      />
      <RailButton
        icon={<MessageCircle size={31} className="text-white" />}
        count={commentCount}
        label="View comments"
        onClick={onOpenComments}
      />
      <RailButton
        icon={<ShareIcon size={30} className="text-white" />}
        count={shareCount}
        label="Share"
        showLabel
        onClick={onShare}
      />
      <RailButton
        icon={<Layers size={30} className="text-white" />}
        label="Episodes"
        showLabel
        onClick={onOpenEpisodes}
      />
    </div>
  );
}
