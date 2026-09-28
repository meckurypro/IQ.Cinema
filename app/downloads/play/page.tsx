// app/downloads/play/page.tsx
//
// Offline player: plays a downloaded episode from on-device storage with the
// same VideoPlayer as the online feed. `?ep=<episodeId>`.

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useBlobUrl, useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { offlineManager } from "@/lib/offline/manager";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { PlayerTopBar } from "@/components/watch/PlayerTopBar";
import { SpeedSheet } from "@/components/watch/SpeedSheet";
import { BottomSheet } from "@/components/shared/BottomSheet";
import clsx from "clsx";

function OfflinePlayer() {
  const router = useRouter();
  const params = useSearchParams();
  const epId = params.get("ep");
  const dl = useOfflineDownloads();

  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const episode = useMemo(() => dl.episodes.find((e) => e.episodeId === epId), [dl.episodes, epId]);
  const folder = useMemo(
    () => dl.folders.find((f) => f.title.titleId === episode?.titleId),
    [dl.folders, episode?.titleId]
  );
  const poster = useBlobUrl(folder?.title.poster);
  const playable = useMemo(() => folder?.episodes.filter((e) => e.status === "complete") ?? [], [folder]);
  const complete = episode?.status === "complete";

  // Build the playable URL from the stored chunks; revoke it when the episode
  // changes so we never leak a multi-hundred-MB blob reference.
  useEffect(() => {
    if (!epId || !dl.ready || !complete) return;
    let url: string | null = null;
    let cancelled = false;
    setSrc(undefined);
    setFailed(false);
    offlineManager
      .objectUrlFor(epId)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        url = u;
        if (u) setSrc(u);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [epId, dl.ready, complete]);

  // Missing/removed episode -> back to the list rather than a dead screen.
  useEffect(() => {
    if (dl.ready && !episode) router.replace("/downloads");
  }, [dl.ready, episode, router]);

  function go(id: string) {
    setShowMore(false);
    router.replace(`/downloads/play?ep=${id}`);
  }

  function playNext() {
    if (!episode) return;
    const next = playable.find((e) => e.episodeNumber > episode.episodeNumber);
    if (next) go(next.episodeId);
  }

  async function remove() {
    if (!episode) return;
    setShowMore(false);
    await dl.removeEpisodes([episode.episodeId]);
    router.replace(folder && folder.episodes.length > 1 ? `/downloads?title=${folder.title.titleId}` : "/downloads");
  }

  if (!dl.ready || !episode) return <div className="h-dvh bg-black" />;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {src ? (
        <VideoPlayer
          key={episode.episodeId}
          src={src}
          autoPlay
          speed={speed}
          posterUrl={poster ?? undefined}
          title={folder?.title.title}
          synopsis={folder?.title.synopsis}
          onEnded={playNext}
          topBar={
            <PlayerTopBar
              episodeNumber={episode.episodeNumber}
              onBack={() => router.back()}
              speed={speed}
              onOpenSpeed={() => setShowSpeed(true)}
              onOpenMore={() => setShowMore(true)}
            />
          }
        />
      ) : (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/60">
          {failed || !complete ? "This episode isn't available offline." : null}
        </div>
      )}

      <SpeedSheet open={showSpeed} onClose={() => setShowSpeed(false)} speed={speed} onSelect={setSpeed} />

      <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="Downloaded episodes">
        <div className="flex flex-col gap-1 px-3 pb-2 pt-1">
          {playable.map((e) => (
            <button
              key={e.episodeId}
              type="button"
              onClick={() => go(e.episodeId)}
              className={clsx(
                "flex items-center justify-between rounded-md px-1.5 py-2.5 text-left text-[14px] transition-colors active:bg-surface-raised",
                e.episodeId === episode.episodeId ? "font-semibold text-pink" : "font-medium text-text"
              )}
            >
              <span>EP.{e.episodeNumber}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={remove}
            className="mt-1 flex items-center gap-2.5 rounded-md px-1.5 py-2.5 text-left text-[14px] font-medium text-crimson transition-colors active:bg-surface-raised"
          >
            <Trash2 size={18} />
            Delete this download
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

export default function OfflinePlayPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-black" />}>
      <OfflinePlayer />
    </Suspense>
  );
}
