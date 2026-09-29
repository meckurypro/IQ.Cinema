// components/downloads/EpisodeRow.tsx

"use client";

import Link from "next/link";
import { Pause, Play, RotateCw, Sparkles } from "lucide-react";
import clsx from "clsx";
import { formatDuration } from "@/lib/format";
import { useBlobUrl } from "@/hooks/useOfflineDownloads";
import type { OfflineEpisode } from "@/lib/offline/db";
import { SelectDot } from "@/components/library/SelectDot";
import { ProgressRing } from "./ProgressRing";

function fraction(ep: OfflineEpisode) {
  return ep.totalBytes > 0 ? ep.receivedBytes / ep.totalBytes : -1;
}

function statusLine(ep: OfflineEpisode) {
  const pct = ep.totalBytes > 0 ? `${Math.floor(fraction(ep) * 100)}%` : null;
  switch (ep.status) {
    case "complete":
      return formatDuration(ep.durationSeconds) || "Ready to watch";
    case "queued":
      return "Waiting to download…";
    case "downloading":
      return pct ? `Downloading ${pct}` : "Downloading…";
    case "processing":
      return "Finishing up…";
    case "paused":
      return ep.error === "offline" ? "Waiting for connection" : `Paused${pct ? ` · ${pct}` : ""}`;
    case "error":
      return ep.error || "Download failed";
  }
}

// One downloaded (or downloading) episode inside a movie folder.
export function EpisodeRow({
  episode,
  poster,
  editing,
  selected,
  onToggleSelect,
  onPause,
  onResume,
}: {
  episode: OfflineEpisode;
  poster: Blob | null;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const posterUrl = useBlobUrl(poster);
  const complete = episode.status === "complete";
  const inFlight = episode.status === "downloading" || episode.status === "queued";
  const processing = episode.status === "processing";

  const content = (
    <>
      <div className="relative aspect-[3/4] w-[72px] shrink-0 overflow-hidden rounded-lg bg-surface-raised">
        {posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
          EP.{episode.episodeNumber}
        </span>
      </div>

      <div className="min-w-0 flex-1 py-1">
        <p className="truncate text-[16px] font-semibold text-text">
          {episode.name?.trim() || `Episode ${episode.episodeNumber}`}
        </p>
        <p className={clsx("mt-1 text-[13px]", episode.status === "error" ? "text-crimson" : "text-muted")}>
          {statusLine(episode)}
        </p>
      </div>
    </>
  );

  const control = editing ? null : complete ? (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-pink to-crimson text-white shadow-[0_8px_18px_-8px_rgb(var(--pink)_/_0.65)]">
      <Play size={16} className="ml-0.5 fill-white" />
    </span>
  ) : processing ? (
    // Not interactive — there's no network transfer to pause/resume here,
    // just a local encode running to completion.
    <ProgressRing
      progress={episode.processProgress != null ? episode.processProgress : -1}
      size={40}
      className="shrink-0"
    >
      <Sparkles size={14} />
    </ProgressRing>
  ) : (
    <button
      type="button"
      onClick={inFlight ? onPause : onResume}
      aria-label={inFlight ? "Pause download" : episode.status === "error" ? "Retry download" : "Resume download"}
      className="shrink-0"
    >
      <ProgressRing progress={inFlight && episode.totalBytes === 0 ? -1 : fraction(episode)} size={40}>
        {inFlight ? (
          <Pause size={14} className="fill-current" />
        ) : episode.status === "error" ? (
          <RotateCw size={14} />
        ) : (
          <Play size={14} className="ml-0.5 fill-current" />
        )}
      </ProgressRing>
    </button>
  );

  return (
    <div className="flex items-center gap-3">
      {editing && <SelectDot selected={selected} className={clsx(!selected && "border-muted/60 bg-transparent")} />}

      {editing ? (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} episode ${episode.episodeNumber}`}
          className="flex min-w-0 flex-1 gap-3.5 text-left"
        >
          {content}
        </button>
      ) : complete ? (
        <Link href={`/downloads/play?ep=${episode.episodeId}`} className="flex min-w-0 flex-1 gap-3.5">
          {content}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 gap-3.5">{content}</div>
      )}

      {control}
    </div>
  );
}
