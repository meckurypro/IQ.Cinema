// components/creator/upload/UploadProgressCard.tsx
//
// Real-time upload progress: a bar that moves with every chunk, plus bytes,
// speed, ETA and the engine's honest state (uploading / paused / reconnecting /
// waiting for a connection / failed) with the controls that make sense for it.

"use client";

import clsx from "clsx";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { formatBytes, formatEta, formatSpeed } from "@/lib/upload/format";
import type { UploadSnapshot } from "@/lib/upload/tusUpload";

export function UploadProgressCard({
  snapshot,
  fileName,
  errorText,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  snapshot: UploadSnapshot;
  fileName: string;
  errorText?: string | null;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const pct = Math.round(snapshot.fraction * 100);
  const phase = snapshot.phase;
  const failed = phase === "error";
  const paused = phase === "paused";
  const waiting = phase === "offline" || phase === "retrying";

  const statusText = failed
    ? errorText ?? t("upload.wiz.err.unknown", { status: "" })
    : paused
      ? t("upload.wiz.paused")
      : phase === "offline"
        ? t("upload.wiz.waitingConnection")
        : phase === "retrying"
          ? t("upload.wiz.reconnecting", { n: snapshot.retryAttempt || 1 })
          : phase === "starting"
            ? t("upload.wiz.starting")
            : phase === "done"
              ? t("upload.wiz.uploadComplete")
              : t("upload.wiz.uploading");

  return (
    <div className="rounded-md border border-border bg-surface p-3.5" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text">{fileName}</p>
          <p className={clsx("mt-0.5 text-[12px]", failed ? "text-crimson" : waiting ? "text-gold" : "text-muted")}>
            {statusText}
          </p>
        </div>
        <p className="shrink-0 font-display text-[22px] font-semibold tabular-nums leading-none text-text">{pct}%</p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t("upload.wiz.uploadProgress")}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-200 ease-out",
            failed ? "bg-crimson" : waiting || paused ? "bg-gold" : "bg-gradient-to-r from-pink to-crimson"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11.5px] tabular-nums text-muted">
        <span>
          {formatBytes(snapshot.bytesUploaded)} / {formatBytes(snapshot.bytesTotal)}
        </span>
        {phase === "uploading" && (
          <span>
            {formatSpeed(snapshot.speedBps)} · {t("upload.wiz.eta", { time: formatEta(snapshot.etaSeconds) })}
          </span>
        )}
      </div>

      {phase !== "done" && (
        <div className="mt-3 flex gap-2">
          {failed ? (
            <button type="button" onClick={onRetry} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-r from-pink to-crimson px-3.5 text-[13px] font-semibold text-white">
              <RotateCcw size={14} /> {t("upload.wiz.retry")}
            </button>
          ) : paused ? (
            <button type="button" onClick={onResume} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-r from-pink to-crimson px-3.5 text-[13px] font-semibold text-white">
              <Play size={14} /> {t("upload.wiz.resume")}
            </button>
          ) : (
            <button type="button" onClick={onPause} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3.5 text-[13px] font-medium text-text">
              <Pause size={14} /> {t("upload.wiz.pause")}
            </button>
          )}
          <button type="button" onClick={onCancel} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted hover:text-text">
            <X size={14} /> {t("upload.wiz.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
