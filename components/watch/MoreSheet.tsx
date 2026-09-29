// components/watch/MoreSheet.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Download, MonitorPlay, Pause, Play, RotateCw } from "lucide-react";
import { BottomSheet, markSheetNavigating } from "@/components/shared/BottomSheet";
import { ProgressRing } from "@/components/downloads/ProgressRing";
import type { OfflineEpisode } from "@/lib/offline/db";
import { useI18n } from "@/hooks/useI18n";

// Every episode is stored as a single rendition today (see video_width /
// video_height on the row) — there's no ladder of bitrates to switch
// between yet. This still gives the viewer a real, honest quality readout
// instead of a fake picklist; once multiple renditions exist server-side,
// swap this one row for a mapped list and wire onSelect to change src.
function qualityLabel(height: number | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!height) return t("watch.qualityAuto");
  if (height >= 1080) return t("watch.qualityFullHd", { h: height });
  if (height >= 720) return t("watch.qualityHd", { h: height });
  return `${height}p`;
}

export function MoreSheet({
  open,
  onClose,
  videoHeight,
  downloadState,
  downloadDisabledReason,
  onDownload,
  onPauseDownload,
  onResumeDownload,
  onRemoveDownload,
  downloadsHref,
}: {
  open: boolean;
  onClose: () => void;
  videoHeight: number | null;
  // Where this episode stands in the in-app offline store (undefined = not downloaded).
  downloadState?: OfflineEpisode;
  // Why downloading isn't possible right now (signed out, locked, no video).
  downloadDisabledReason: string | null;
  onDownload: () => Promise<void>;
  onPauseDownload: () => void;
  onResumeDownload: () => void;
  onRemoveDownload: () => void;
  // The movie's folder inside the in-app Downloads screen.
  downloadsHref: string;
}) {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (starting || downloadDisabledReason) return;
    setStarting(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch (e) {
      setDownloadError(e instanceof Error && e.message ? e.message : t("watch.downloadStartError"));
    } finally {
      setStarting(false);
    }
  }

  const status = downloadState?.status;
  const inFlight = status === "queued" || status === "downloading";
  const fraction =
    downloadState && downloadState.totalBytes > 0 ? downloadState.receivedBytes / downloadState.totalBytes : -1;

  return (
    <BottomSheet open={open} onClose={onClose} title={t("watch.playbackOptions")}>
      <div className="flex flex-col gap-1 px-3 pb-2 pt-1">
        <div className="flex items-center justify-between rounded-md px-1.5 py-2.5">
          <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
            <MonitorPlay size={18} className="text-muted" />
            {t("watch.quality")}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            {qualityLabel(videoHeight, t)}
            <Check size={15} className="text-pink" />
          </span>
        </div>

        {/* Downloads stay inside the app: this saves to the in-app Downloads
            screen for offline viewing, never to the phone's files or gallery. */}
        {!downloadState && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={starting || !!downloadDisabledReason}
            className="flex items-center justify-between rounded-md px-1.5 py-2.5 text-left transition-colors active:bg-surface-raised disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
                <Download size={18} className="text-muted" />
                {starting ? t("watch.starting") : t("watch.download")}
              </span>
              <span className="ml-[30px] mt-0.5 text-[12px] text-muted">
                {downloadDisabledReason ?? t("watch.downloadOffline")}
              </span>
            </span>
          </button>
        )}

        {downloadState && inFlight && (
          <div className="flex items-center justify-between rounded-md px-1.5 py-2.5">
            <span className="flex flex-col">
              <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
                <Download size={18} className="text-muted" />
                {status === "queued"
                  ? t("watch.waitingToDownload")
                  : fraction >= 0
                    ? t("watch.downloadingPct", { pct: Math.floor(fraction * 100) })
                    : t("watch.downloading")}
              </span>
            </span>
            <button type="button" onClick={onPauseDownload} aria-label={t("watch.pauseDownload")}>
              <ProgressRing progress={fraction} size={34}>
                <Pause size={12} className="fill-current" />
              </ProgressRing>
            </button>
          </div>
        )}

        {downloadState && (status === "paused" || status === "error") && (
          <div className="flex items-center justify-between rounded-md px-1.5 py-2.5">
            <span className="flex flex-col">
              <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
                <Download size={18} className="text-muted" />
                {status === "error"
                  ? t("watch.downloadFailed")
                  : downloadState.error === "offline"
                    ? t("watch.waitingForConnection")
                    : t("watch.downloadPaused")}
              </span>
              {status === "error" && downloadState.error && (
                <span className="ml-[30px] mt-0.5 text-[12px] text-crimson">{downloadState.error}</span>
              )}
            </span>
            <button type="button" onClick={onResumeDownload} aria-label={status === "error" ? t("watch.retryDownload") : t("watch.resumeDownload")}>
              <ProgressRing progress={fraction} size={34}>
                {status === "error" ? <RotateCw size={12} /> : <Play size={12} className="ml-0.5 fill-current" />}
              </ProgressRing>
            </button>
          </div>
        )}

        {downloadState && status === "complete" && (
          <>
            <Link
              href={downloadsHref}
              onClick={() => markSheetNavigating()}
              className="flex items-center justify-between rounded-md px-1.5 py-2.5 transition-colors active:bg-surface-raised"
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
                  <Check size={18} className="text-gold" />
                  {t("watch.downloaded")}
                </span>
                <span className="ml-[30px] mt-0.5 text-[12px] text-muted">{t("watch.viewInDownloads")}</span>
              </span>
              <ChevronRight size={16} className="text-muted" />
            </Link>
            <button
              type="button"
              onClick={onRemoveDownload}
              className="rounded-md px-1.5 py-2 text-left text-[13px] font-medium text-crimson transition-colors active:bg-surface-raised"
            >
              <span className="ml-[30px]">{t("watch.removeDownload")}</span>
            </button>
          </>
        )}

        {downloadError && <p className="px-1.5 text-[12px] text-crimson">{downloadError}</p>}
      </div>
    </BottomSheet>
  );
}
