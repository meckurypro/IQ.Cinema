// components/watch/MoreSheet.tsx

"use client";

import { useState } from "react";
import { Check, Download, Loader2, MonitorPlay } from "lucide-react";
import { BottomSheet } from "@/components/shared/BottomSheet";

// Every episode is stored as a single rendition today (see video_width /
// video_height on the row) — there's no ladder of bitrates to switch
// between yet. This still gives the viewer a real, honest quality readout
// instead of a fake picklist; once multiple renditions exist server-side,
// swap this one row for a mapped list and wire onSelect to change src.
function qualityLabel(height: number | null) {
  if (!height) return "Auto";
  if (height >= 1080) return `${height}p · Full HD`;
  if (height >= 720) return `${height}p · HD`;
  return `${height}p`;
}

export function MoreSheet({
  open,
  onClose,
  videoHeight,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  videoHeight: number | null;
  onDownload: () => Promise<void>;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch {
      setDownloadError("Couldn't start the download. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Playback options">
      <div className="flex flex-col gap-1 px-3 pb-2 pt-1">
        <div className="flex items-center justify-between rounded-md px-1.5 py-2.5">
          <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
            <MonitorPlay size={18} className="text-muted" />
            Quality
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            {qualityLabel(videoHeight)}
            <Check size={15} className="text-pink" />
          </span>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-between rounded-md px-1.5 py-2.5 text-left transition-colors active:bg-surface-raised disabled:opacity-60"
        >
          <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
            {downloading ? (
              <Loader2 size={18} className="animate-spin text-muted" />
            ) : (
              <Download size={18} className="text-muted" />
            )}
            {downloading ? "Preparing download…" : "Download"}
          </span>
        </button>
        {downloadError && <p className="px-1.5 text-[12px] text-crimson">{downloadError}</p>}
      </div>
    </BottomSheet>
  );
}
