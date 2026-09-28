// hooks/useOfflineDownloads.ts

"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { offlineManager, type EpisodeDownloadInput, type TitleDownloadInput } from "@/lib/offline/manager";
import type { OfflineEpisode, OfflineTitle } from "@/lib/offline/db";

export type DownloadFolder = {
  title: OfflineTitle;
  // Episode order within the folder: EP.1, EP.2, ...
  episodes: OfflineEpisode[];
  completeCount: number;
  activeCount: number;
  lastAdded: number;
};

export function useOfflineDownloads() {
  const { user, loading } = useAuth();
  const snap = useSyncExternalStore(
    offlineManager.subscribe,
    offlineManager.getSnapshot,
    offlineManager.getServerSnapshot
  );

  // Wait for auth to settle so we don't briefly load the wrong user's list;
  // when offline auth resolves to no user and the manager falls back to the
  // last user on this device.
  useEffect(() => {
    if (loading) return;
    void offlineManager.init(user?.id ?? null);
  }, [user?.id, loading]);

  const folders = useMemo<DownloadFolder[]>(() => {
    const byTitle = new Map<string, OfflineEpisode[]>();
    for (const e of snap.episodes) {
      const list = byTitle.get(e.titleId) ?? [];
      list.push(e);
      byTitle.set(e.titleId, list);
    }
    const out: DownloadFolder[] = [];
    for (const title of snap.titles) {
      const episodes = (byTitle.get(title.titleId) ?? []).sort((a, b) => a.episodeNumber - b.episodeNumber);
      if (!episodes.length) continue;
      out.push({
        title,
        episodes,
        completeCount: episodes.filter((e) => e.status === "complete").length,
        activeCount: episodes.filter((e) => e.status === "downloading" || e.status === "queued").length,
        lastAdded: Math.max(...episodes.map((e) => e.addedAt)),
      });
    }
    return out.sort((a, b) => b.lastAdded - a.lastAdded);
  }, [snap.titles, snap.episodes]);

  const episodeState = useCallback(
    (episodeId: string) => snap.episodes.find((e) => e.episodeId === episodeId),
    [snap.episodes]
  );

  return {
    ready: snap.ready,
    folders,
    episodes: snap.episodes,
    episodeState,
    download: (ep: EpisodeDownloadInput, title: TitleDownloadInput) => offlineManager.download(ep, title),
    pause: (id: string) => offlineManager.pause(id),
    resume: (id: string) => offlineManager.resume(id),
    removeEpisodes: async (ids: string[]) => {
      for (const id of ids) await offlineManager.removeEpisode(id);
    },
    removeTitles: async (ids: string[]) => {
      for (const id of ids) await offlineManager.removeTitle(id);
    },
  };
}

// Object URL for a stored Blob (poster), revoked when it changes/unmounts.
export function useBlobUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}
