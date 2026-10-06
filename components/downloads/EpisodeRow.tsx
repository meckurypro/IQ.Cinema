// components/downloads/EpisodeRow.tsx

"use client";

import Link from "next/link";
import { Pause, Play, RotateCw } from "lucide-react";
import clsx from "clsx";
import { formatDuration } from "@/lib/format";
import { useBlobUrl } from "@/hooks/useOfflineDownloads";
import type { OfflineEpisode } from "@/lib/offline/db";
import { SelectDot } from "@/components/library/SelectDot";
import { ProgressRing } from "./ProgressRing";
import { useI18n } from "@/hooks/useI18n";
import { translateRuntimeError } from "@/lib/i18n/runtimeErrors";

function fraction(ep: OfflineEpisode) {
  return ep.totalBytes > 0 ? ep.receivedBytes / ep.totalBytes : -1;
}

function statusLine(ep: OfflineEpisode, t: ReturnType<typeof useI18n>["t"]) {
  const pct = ep.totalBytes > 0 ? `${Math.floor(fraction(ep) * 100)}%` : null;
  switch (ep.status) {
    case "complete":
      return formatDuration(ep.durationSeconds) || t("downloads.readyToWatch");
    case "queued":
      return t("watch.waitingToDownload");
    case "downloading":
      return pct ? t("watch.downloadingPct", { pct: Math.floor(fraction(ep) * 100) }) : t("watch.downloading");
    case "processing": // legacy rows only; nothing is processed on-device anymore
      return formatDuration(ep.durationSeconds) || t("downloads.readyToWatch");
    case "paused":
      return ep.error === "offline"
        ? t("watch.waitingForConnection")
        : pct
          ? t("downloads.pausedPct", { pct })
          : t("downloads.paused");
    case "error":
      return ep.error ? translateRuntimeError(ep.error, t) : t("watch.downloadFailed");
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
  const { t } = useI18n();
  const posterUrl = useBlobUrl(poster);
  const complete = episode.status === "complete";
  const inFlight = episode.status === "downloading" || episode.status === "queued";

  const content = (
    <>
      <div className="relative aspect-[3/4] w-[72px] shrink-0 overflow-hidden rounded-lg bg-surface-raised">
        {posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
          {t("common.epShort", { n: episode.episodeNumber })}
        </span>
      </div>

      <div className="min-w-0 flex-1 py-1">
        <p className="truncate text-[16px] font-semibold text-text">
          {episode.name?.trim() || t("common.episodeN", { n: episode.episodeNumber })}
        </p>
        <p className={clsx("mt-1 text-[13px]", episode.status === "error" ? "text-crimson" : "text-muted")}>
          {statusLine(episode, t)}
        </p>
      </div>
    </>
  );

  const control = editing ? null : complete ? (
    <Link
      href={`/downloads/play?ep=${episode.episodeId}`}
      aria-label={t("common.play")}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-pink to-crimson text-white shadow-[0_8px_18px_-8px_rgb(var(--pink)_/_0.65)]"
    >
      <Play size={16} className="ml-0.5 fill-white" />
    </Link>
  ) : (
    <button
      type="button"
      onClick={inFlight ? onPause : onResume}
      aria-label={inFlight ? t("watch.pauseDownload") : episode.status === "error" ? t("watch.retryDownload") : t("watch.resumeDownload")}
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
          aria-label={t(selected ? "downloads.deselectItem" : "downloads.selectItem", { name: t("common.episodeN", { n: episode.episodeNumber }) })}
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
