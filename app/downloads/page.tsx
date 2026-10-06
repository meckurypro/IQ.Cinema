// app/downloads/page.tsx
//
// In-app Downloads. Everything here reads from on-device storage only, so the
// screen works with no connection. `/downloads` lists movie folders;
// `/downloads?title=<id>` opens one folder (a single query-param page rather
// than a dynamic route so one cached shell serves every folder offline).

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, SquarePen } from "lucide-react";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { formatEpisodeCount } from "@/lib/format";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/library/EmptyState";
import { EditBar } from "@/components/library/EditBar";
import { FolderCard } from "@/components/downloads/FolderCard";
import { EpisodeRow } from "@/components/downloads/EpisodeRow";
import { useI18n } from "@/hooks/useI18n";

function DownloadsInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const titleId = params.get("title");
  const dl = useOfflineDownloads();

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const folder = useMemo(
    () => (titleId ? dl.folders.find((f) => f.title.titleId === titleId) ?? null : null),
    [dl.folders, titleId]
  );

  // Leaving a view (or emptying it) always exits edit mode.
  useEffect(() => {
    setEditing(false);
    setSelected(new Set());
  }, [titleId]);

  // Deleting the last episode removes the folder; drop back to the list.
  useEffect(() => {
    if (titleId && dl.ready && !folder) router.replace("/downloads");
  }, [titleId, dl.ready, folder, router]);

  const items = folder ? folder.episodes.map((e) => e.episodeId) : dl.folders.map((f) => f.title.titleId);
  const total = items.length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items)));
  }

  function toggleEdit() {
    setEditing((v) => !v);
    setSelected(new Set());
  }

  async function removeSelected() {
    const ids = Array.from(selected);
    setConfirmOpen(false);
    if (!ids.length) return;
    if (folder) await dl.removeEpisodes(ids);
    else await dl.removeTitles(ids);
    setSelected(new Set());
    setEditing(false);
  }

  const confirmBody = folder ? t("downloads.confirmEpisodes") : t("downloads.confirmMovies");

  return (
    <div className="fade-in px-4 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 pb-3">
          {folder && (
            <Link href="/downloads" aria-label={t("downloads.backToDownloads")} className="-ml-1 grid h-9 w-9 shrink-0 place-items-center text-text">
              <ArrowLeft size={22} />
            </Link>
          )}
          <h1 className="truncate text-[21px] font-semibold leading-tight text-text">
            {folder ? folder.title.title.trim() : t("downloads.title")}
          </h1>
        </div>

        <button
          type="button"
          onClick={toggleEdit}
          disabled={!total && !editing}
          aria-label={editing ? t("downloads.doneEditing") : t("downloads.edit")}
          className="-mt-0.5 grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-1 text-text transition-opacity disabled:opacity-30"
        >
          {editing ? (
            <span className="px-2 text-[15px] font-semibold text-pink">{t("downloads.done")}</span>
          ) : (
            <SquarePen size={24} strokeWidth={1.75} />
          )}
        </button>
      </div>

      {dl.ready && total > 0 && (
        <p className="-mt-2 text-[13px] text-muted">
          {folder
            ? formatEpisodeCount(folder.episodes.length, t)
            : t(dl.folders.length === 1 ? "downloads.movie" : "downloads.movies", { n: dl.folders.length })}
        </p>
      )}

      {!dl.ready && (
        <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 desk:grid-cols-5 desk:gap-x-5 desk:gap-y-8 xl:grid-cols-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="aspect-[3/4] w-full rounded-lg" />
              <Skeleton className="mt-2 h-3.5 w-4/5" />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {dl.ready && !dl.folders.length && !titleId && (
        <EmptyState message={t("downloads.empty")} />
      )}

      {dl.ready && !folder && dl.folders.length > 0 && (
        <div className="fade-in mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 desk:grid-cols-5 desk:gap-x-5 desk:gap-y-8 xl:grid-cols-6" style={{ paddingBottom: editing ? "4.5rem" : 0 }}>
          {dl.folders.map((f) => (
            <FolderCard
              key={f.title.titleId}
              folder={f}
              editing={editing}
              selected={selected.has(f.title.titleId)}
              onToggleSelect={() => toggleSelect(f.title.titleId)}
            />
          ))}
        </div>
      )}

      {folder && (
        <div className="fade-in mt-5 space-y-4" style={{ paddingBottom: editing ? "4.5rem" : 0 }}>
          {folder.episodes.map((ep) => (
            <EpisodeRow
              key={ep.episodeId}
              episode={ep}
              poster={folder.title.poster}
              editing={editing}
              selected={selected.has(ep.episodeId)}
              onToggleSelect={() => toggleSelect(ep.episodeId)}
              onPause={() => dl.pause(ep.episodeId)}
              onResume={() => dl.resume(ep.episodeId)}
            />
          ))}
        </div>
      )}

      {dl.ready && total > 0 && <p className="mt-8 pb-2 text-center text-[15px] text-muted/70">{t("downloads.theEnd")}</p>}

      {editing && (
        <EditBar
          selectedCount={selected.size}
          total={total}
          actionLabel={t("downloads.delete")}
          onToggleAll={toggleAll}
          onAction={() => setConfirmOpen(true)}
        />
      )}

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("downloads.deleteTitle")}>
        <div className="px-5 pb-5">
          <p className="text-[14px] leading-relaxed text-muted">
            {t(folder ? "downloads.selectedEpisodes" : "downloads.selectedMovies", {
              n: selected.size,
              body: confirmBody,
            })}
          </p>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" className="flex-1" onClick={removeSelected}>
              {t("downloads.delete")}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

export default function DownloadsPage() {
  return (
    <Suspense fallback={<div className="px-4 pt-5" />}>
      <DownloadsInner />
    </Suspense>
  );
}
