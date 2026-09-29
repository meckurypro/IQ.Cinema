// components/downloads/FolderCard.tsx

"use client";

import Link from "next/link";
import { Download, Folder } from "lucide-react";
import clsx from "clsx";
import { formatEpisodeCount } from "@/lib/format";
import { useBlobUrl, type DownloadFolder } from "@/hooks/useOfflineDownloads";
import { SelectDot } from "@/components/library/SelectDot";
import { useI18n } from "@/hooks/useI18n";

// One movie folder on the Downloads screen. Same 3:4 poster card as My List.
export function FolderCard({
  folder,
  editing,
  selected,
  onToggleSelect,
}: {
  folder: DownloadFolder;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { t } = useI18n();
  const poster = useBlobUrl(folder.title.poster);
  const name = folder.title.title.trim();
  const count = folder.episodes.length;

  const body = (
    <>
      <div
        className={clsx(
          "relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-raised transition-shadow",
          selected && "ring-2 ring-pink"
        )}
      >
        {poster ? (
          // Blob URL from local storage — next/image can't optimise these.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={name}
            className={clsx("h-full w-full object-cover transition-transform duration-300", !editing && "group-active:scale-95")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No poster</div>
        )}

        {folder.activeCount > 0 && (
          <span className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-lg bg-gradient-to-r from-orange-500 to-pink px-2 py-1 text-[12px] font-bold leading-none text-white">
            <Download size={12} />
            {folder.activeCount}
          </span>
        )}

        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <Folder size={11} className="fill-white/90" />
          {t("common.epCount", { n: count })}
        </span>

        {editing && <SelectDot selected={selected} className="absolute bottom-1.5 right-1.5" />}
      </div>

      <p className="mt-2 truncate text-[14px] font-semibold text-text">{name}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-muted">{formatEpisodeCount(count, t)}</p>
    </>
  );

  if (editing) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={t(selected ? "downloads.deselectItem" : "downloads.selectItem", { name })}
        className="group min-w-0 text-left"
      >
        {body}
      </button>
    );
  }

  return (
    <Link href={`/downloads?title=${folder.title.titleId}`} className="group min-w-0">
      {body}
    </Link>
  );
}
