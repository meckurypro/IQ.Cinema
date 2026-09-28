// components/watch/EpisodeFeed.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { getDeviceId } from "@/lib/device";
import { downloadEpisodeVideo } from "@/lib/download";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { PlayerTopBar } from "@/components/watch/PlayerTopBar";
import { SpeedSheet } from "@/components/watch/SpeedSheet";
import { MoreSheet } from "@/components/watch/MoreSheet";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";

type FeedEpisode = {
  id: string;
  episode_number: number;
  name: string | null;
  title_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  unlock_cost_coins: number | null;
  video_height: number | null;
  comment_count: number;
  share_count: number;
  save_count: number;
  like_count: number;
};

type TitleData = {
  title: string;
  synopsis: string | null;
  content_rating: string | null;
  poster_url: string | null;
  total_unique_views: number;
  free_episode_count: number | null;
};

// Local overrides on top of the server counts each episode arrived with —
// only touched by this viewer's own taps, so a fresh fetch is never needed
// mid-session.
type Engagement = {
  saved: boolean;
  saveCount: number;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
};

export function EpisodeFeed({ initialEpisodeId }: { initialEpisodeId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [episodes, setEpisodes] = useState<FeedEpisode[] | null>(null);
  const [titleData, setTitleData] = useState<TitleData | null>(null);
  const [freeCount, setFreeCount] = useState(4);
  const [defaultUnlockCost, setDefaultUnlockCost] = useState(30);
  const [activeId, setActiveId] = useState(initialEpisodeId);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [showComments, setShowComments] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [shareToast, setShareToast] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const savingRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef(0);
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0);
  const didInitialScroll = useRef(false);

  // Load every published episode for this title, in order, plus the title
  // itself and free/pricing settings — everything the whole feed needs up
  // front, in one round trip per table.
  useEffect(() => {
    async function load() {
      const { data: seed } = await supabase
        .from("episodes")
        .select("title_id")
        .eq("id", initialEpisodeId)
        .single();
      if (!seed) return;

      const [{ data: eps }, { data: t }, { data: settings }] = await Promise.all([
        supabase
          .from("episodes")
          .select(
            "id, episode_number, name, title_id, video_url, thumbnail_url, duration_seconds, unlock_cost_coins, video_height, comment_count, share_count, save_count, like_count"
          )
          .eq("title_id", seed.title_id)
          .eq("status", "published")
          .order("episode_number", { ascending: true }),
        supabase
          .from("titles")
          .select("title, synopsis, content_rating, poster_url, total_unique_views, free_episode_count")
          .eq("id", seed.title_id)
          .single(),
        supabase
          .from("platform_settings")
          .select("default_free_episodes, default_episode_unlock_coins")
          .single(),
      ]);

      setEpisodes((eps as FeedEpisode[]) ?? []);
      setTitleData((t as TitleData) ?? null);
      setFreeCount(t?.free_episode_count ?? settings?.default_free_episodes ?? 4);
      setDefaultUnlockCost(settings?.default_episode_unlock_coins ?? 30);
      setEngagement((prev) => {
        const next = { ...prev };
        for (const ep of eps ?? []) {
          if (!next[ep.id]) {
            next[ep.id] = {
              saved: false,
              saveCount: ep.save_count ?? 0,
              liked: false,
              likeCount: ep.like_count ?? 0,
              commentCount: ep.comment_count ?? 0,
              shareCount: ep.share_count ?? 0,
            };
          }
        }
        return next;
      });
    }
    load();
  }, [initialEpisodeId, supabase]);

  const episodeIds = (episodes ?? []).map((e) => e.id);
  const idsKey = episodeIds.join(",");

  // This viewer's paid unlocks, saves and likes across every episode of the
  // title — one lookup each, not one per slide.
  useEffect(() => {
    if (!user || !idsKey) {
      setUnlockedIds(new Set());
      return;
    }
    let ignore = false;
    (async () => {
      const ids = idsKey.split(",");
      const [{ data: unlocks }, { data: saves }, { data: likes }] = await Promise.all([
        supabase.from("episode_unlocks").select("episode_id").eq("user_id", user.id).in("episode_id", ids),
        supabase.from("episode_saves").select("episode_id").eq("user_id", user.id).in("episode_id", ids),
        supabase.from("episode_likes").select("episode_id").eq("user_id", user.id).in("episode_id", ids),
      ]);
      if (ignore) return;
      setUnlockedIds(new Set((unlocks ?? []).map((u) => u.episode_id)));
      const savedSet = new Set((saves ?? []).map((s) => s.episode_id));
      const likedSet = new Set((likes ?? []).map((l) => l.episode_id));
      setEngagement((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id]) {
            next[id] = { ...next[id], saved: savedSet.has(id), liked: likedSet.has(id) };
          }
        }
        return next;
      });
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, idsKey, supabase]);

  const isUnlocked = useCallback(
    (ep: FeedEpisode) => ep.episode_number <= freeCount || unlockedIds.has(ep.id),
    [freeCount, unlockedIds]
  );

  const grantUnlock = useCallback(
    async (episodeId: string) => {
      if (!user || unlocking.has(episodeId)) return;
      setUnlocking((prev) => new Set(prev).add(episodeId));
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("unlock_episode", {
        p_user_id: user.id,
        p_episode_id: episodeId,
      });
      setUnlocking((prev) => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
      if (rpcError || !data?.ok) {
        if (data?.error === "insufficient_coins") {
          router.push("/wallet");
          return;
        }
        setError(rpcError?.message || data?.error || "Could not unlock episode");
        return;
      }
      setUnlockedIds((prev) => new Set(prev).add(episodeId));
    },
    [user, unlocking, supabase, router]
  );

  // Free episodes grant themselves the moment they're seen and the viewer
  // isn't unlocked yet — same behavior as before, just per-slide now.
  useEffect(() => {
    if (!episodes || !user) return;
    const current = episodes.find((e) => e.id === activeId);
    if (current && current.episode_number <= freeCount && !unlockedIds.has(current.id)) {
      grantUnlock(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, episodes, user, freeCount, unlockedIds]);

  // Resolve a signed video URL for the active episode plus its immediate
  // neighbors, so the next/previous swipe already has a src ready instead
  // of waiting on a network round trip mid-gesture.
  useEffect(() => {
    if (!episodes) return;
    const idx = episodes.findIndex((e) => e.id === activeId);
    if (idx < 0) return;
    const targets = [episodes[idx - 1], episodes[idx], episodes[idx + 1]].filter(
      (e): e is FeedEpisode => !!e && !!e.video_url && isUnlocked(e) && !videoUrls[e.id]
    );
    if (!targets.length) return;
    let ignore = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (ep) => {
          const { data } = await supabase.storage.from("videos").createSignedUrl(ep.video_url!, 60 * 60);
          return [ep.id, data?.signedUrl] as const;
        })
      );
      if (ignore) return;
      setVideoUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, episodes, isUnlocked, supabase]);

  const refreshVideoUrl = useCallback(
    async (episodeId: string) => {
      const ep = episodes?.find((e) => e.id === episodeId);
      if (!ep?.video_url) return undefined;
      const { data } = await supabase.storage.from("videos").createSignedUrl(ep.video_url, 60 * 60);
      if (data?.signedUrl) setVideoUrls((prev) => ({ ...prev, [episodeId]: data.signedUrl }));
      return data?.signedUrl;
    },
    [episodes, supabase]
  );

  // Which slide is most visible drives everything: which video plays, the
  // EP badge, the URL, and the free-unlock/preload effects above.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !episodes?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = entry.target.getAttribute("data-episode-id");
            if (id) {
              setActiveId(id);
              if (typeof window !== "undefined") {
                window.history.replaceState(null, "", `/watch/${id}`);
              }
            }
          }
        }
      },
      { root: container, threshold: [0.6] }
    );
    for (const el of slideRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [episodes]);

  // Land on the deep-linked episode instantly, no scroll animation.
  useEffect(() => {
    if (didInitialScroll.current || !episodes?.length) return;
    const el = slideRefs.current.get(initialEpisodeId);
    if (el) {
      el.scrollIntoView({ block: "start" });
      didInitialScroll.current = true;
    }
  }, [episodes, initialEpisodeId]);

  useEffect(() => {
    watchedRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
  }, [activeId]);

  function reportProgress(episode: FeedEpisode, playhead: number, force = false) {
    const prev = lastPlayheadRef.current;
    lastPlayheadRef.current = playhead;
    if (prev !== null) {
      const delta = playhead - prev;
      if (delta > 0 && delta <= 1.5) watchedRef.current += delta;
    }
    if (!force && watchedRef.current - lastReportedRef.current < 10) return;
    if (force && watchedRef.current === lastReportedRef.current) return;
    lastReportedRef.current = watchedRef.current;

    supabase
      .rpc("record_play", {
        p_user_id: user?.id ?? null,
        p_device_id: getDeviceId(),
        p_episode_id: episode.id,
        p_watched_seconds: Math.floor(watchedRef.current),
      })
      .then(({ error: playErr }) => {
        if (playErr) console.error("record_play failed", playErr.message);
      });

    if (user) {
      const completed = episode.duration_seconds ? playhead >= episode.duration_seconds * 0.9 : false;
      supabase
        .from("watch_history")
        .upsert(
          {
            user_id: user.id,
            episode_id: episode.id,
            title_id: episode.title_id,
            progress_seconds: Math.floor(playhead),
            completed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,episode_id" }
        )
        .then(() => {});
    }
  }

  function goToNext(episode: FeedEpisode) {
    if (!episodes) return;
    const idx = episodes.findIndex((e) => e.id === episode.id);
    const nextEl = episodes[idx + 1] && slideRefs.current.get(episodes[idx + 1].id);
    nextEl?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function toggleSave(episode: FeedEpisode) {
    if (!user) return router.push("/auth/login");
    if (savingRef.current.has(episode.id)) return;
    savingRef.current.add(episode.id);
    const current = engagement[episode.id];
    const next = !current?.saved;
    setEngagement((prev) => ({
      ...prev,
      [episode.id]: {
        ...prev[episode.id],
        saved: next,
        saveCount: Math.max(0, (prev[episode.id]?.saveCount ?? 0) + (next ? 1 : -1)),
      },
    }));
    let failed = false;
    try {
      const { error: err } = next
        ? await supabase
            .from("episode_saves")
            .upsert({ user_id: user.id, episode_id: episode.id }, { onConflict: "user_id,episode_id", ignoreDuplicates: true })
        : await supabase.from("episode_saves").delete().eq("user_id", user.id).eq("episode_id", episode.id);
      failed = !!err;
    } catch {
      failed = true;
    } finally {
      savingRef.current.delete(episode.id);
    }
    if (failed) {
      setEngagement((prev) => ({
        ...prev,
        [episode.id]: {
          ...prev[episode.id],
          saved: !next,
          saveCount: Math.max(0, (prev[episode.id]?.saveCount ?? 0) + (next ? -1 : 1)),
        },
      }));
    }
  }

  async function handleShare(episode: FeedEpisode) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/watch/${episode.id}` : "";
    const { data } = await supabase.rpc("record_episode_share", { p_episode_id: episode.id });
    setEngagement((prev) => ({
      ...prev,
      [episode.id]: {
        ...prev[episode.id],
        shareCount: data?.ok ? data.share_count : (prev[episode.id]?.shareCount ?? 0) + 1,
      },
    }));

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: episode.name ?? `Episode ${episode.episode_number}`, url });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 1800);
    } catch {
      // no-op
    }
  }

  async function openDetails() {
    setShowDetails(true);
    const active = episodes?.find((e) => e.id === activeId);
    if (!active) return;
    const { data } = await supabase
      .from("titles")
      .select("total_unique_views, synopsis, content_rating")
      .eq("id", active.title_id)
      .single();
    if (data) setTitleData((t) => (t ? { ...t, ...data } : t));
  }

  async function handleDownload() {
    const active = episodes?.find((e) => e.id === activeId);
    if (!active?.video_url) throw new Error("No video");
    const fileName = `${(titleData?.title ?? "iq-cinema").replace(/[^a-z0-9]+/gi, "-")}-ep${active.episode_number}.mp4`;
    await downloadEpisodeVideo(supabase, active.video_url, fileName);
  }

  if (!episodes) {
    return <div className="h-dvh bg-black" />;
  }

  const active = episodes.find((e) => e.id === activeId) ?? episodes[0];
  const trayEpisodes: TrayEpisode[] = episodes.map((e) => ({
    id: e.id,
    episode_number: e.episode_number,
    name: e.name,
    unlock_cost_coins: e.unlock_cost_coins,
  }));

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <div ref={containerRef} className="no-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-auto">
        {episodes.map((ep) => {
          const unlocked = isUnlocked(ep);
          const eng = engagement[ep.id];
          const isActive = ep.id === activeId;

          return (
            <div
              key={ep.id}
              ref={(el) => {
                if (el) slideRefs.current.set(ep.id, el);
                else slideRefs.current.delete(ep.id);
              }}
              data-episode-id={ep.id}
              className="relative h-full w-full snap-start"
            >
              {unlocked ? (
                isActive ? (
                  <VideoPlayer
                    src={videoUrls[ep.id]}
                    autoPlay
                    speed={speed}
                    posterUrl={ep.thumbnail_url ?? titleData?.poster_url ?? undefined}
                    title={titleData?.title}
                    synopsis={titleData?.synopsis}
                    onOpenDetails={openDetails}
                    onRequestFreshSrc={() => refreshVideoUrl(ep.id)}
                    storyboardUrl={ep.video_url ? storyboardPublicUrl(supabase, ep.video_url) : null}
                    onTimeUpdate={(t) => reportProgress(ep, t)}
                    onEnded={() => {
                      reportProgress(ep, ep.duration_seconds ?? lastPlayheadRef.current ?? 0, true);
                      goToNext(ep);
                    }}
                    topBar={
                      <PlayerTopBar
                        episodeNumber={ep.episode_number}
                        onBack={() => router.back()}
                        onOpenTitle={openDetails}
                        speed={speed}
                        onOpenSpeed={() => setShowSpeed(true)}
                        onOpenMore={() => setShowMore(true)}
                      />
                    }
                    actionRail={
                      <ActionRail
                        saved={eng?.saved ?? false}
                        saveCount={eng?.saveCount ?? ep.save_count}
                        onToggleSave={() => toggleSave(ep)}
                        commentCount={eng?.commentCount ?? ep.comment_count}
                        onOpenComments={() => setShowComments(true)}
                        shareCount={eng?.shareCount ?? ep.share_count}
                        onShare={() => handleShare(ep)}
                        onOpenEpisodes={() => setShowTray(true)}
                      />
                    }
                  />
                ) : (
                  // Not yet the active slide: a static frame only, so we
                  // never decode/play more than one video at a time.
                  <div className="relative h-full w-full bg-black">
                    {ep.thumbnail_url && (
                      <Image src={ep.thumbnail_url} alt="" fill className="object-cover opacity-70" />
                    )}
                  </div>
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                  <PlayerTopBar
                    episodeNumber={ep.episode_number}
                    onBack={() => router.back()}
                    speed={speed}
                    onOpenSpeed={() => setShowSpeed(true)}
                    onOpenMore={() => setShowMore(true)}
                  />
                  {user ? (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                        <Lock size={22} className="text-white" />
                      </div>
                      <div>
                        <p className="font-display text-lg font-semibold text-white">
                          Episode {ep.episode_number} is locked
                        </p>
                        <p className="mt-1 text-sm text-white/60">
                          Unlock with coins, or subscribe for unlimited access.
                        </p>
                      </div>
                      {isActive && error && <p className="text-sm text-crimson">{error}</p>}
                      <Button
                        variant="primary"
                        size="lg"
                        disabled={unlocking.has(ep.id)}
                        onClick={() => grantUnlock(ep.id)}
                      >
                        <Zap size={16} className="fill-current" />
                        Unlock for {ep.unlock_cost_coins ?? defaultUnlockCost} coins
                      </Button>
                      <button
                        onClick={() => router.push("/wallet")}
                        className="text-sm font-medium text-white/70 underline underline-offset-4"
                      >
                        See subscription plans
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-lg font-semibold text-white">
                        {ep.episode_number <= freeCount
                          ? `Episode ${ep.episode_number} is free to watch`
                          : `Episode ${ep.episode_number} is locked`}
                      </p>
                      <p className="mt-1 text-sm text-white/60">Sign in to start watching.</p>
                      <Button variant="primary" size="lg" onClick={() => router.push("/auth/login")}>
                        Sign in
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {shareToast && (
        <div className="absolute inset-x-0 bottom-28 z-30 flex justify-center">
          <span className="rounded-full bg-black/70 px-3.5 py-1.5 text-[12px] font-medium text-white">
            Link copied
          </span>
        </div>
      )}

      <SpeedSheet open={showSpeed} onClose={() => setShowSpeed(false)} speed={speed} onSelect={setSpeed} />
      <MoreSheet
        open={showMore}
        onClose={() => setShowMore(false)}
        videoHeight={active?.video_height ?? null}
        onDownload={handleDownload}
      />

      <CommentsSheet
        open={showComments}
        onClose={() => setShowComments(false)}
        episodeId={active.id}
        count={engagement[active.id]?.commentCount ?? active.comment_count}
        onCountChange={(n) =>
          setEngagement((prev) => ({ ...prev, [active.id]: { ...prev[active.id], commentCount: n } }))
        }
      />

      <EpisodeTray
        open={showTray}
        onClose={() => setShowTray(false)}
        episodes={trayEpisodes}
        currentEpisodeId={active.id}
        freeCount={freeCount}
        unlockedIds={unlockedIds}
        defaultCost={defaultUnlockCost}
      />

      <TitleDetailsSheet
        open={showDetails}
        onClose={() => setShowDetails(false)}
        titleId={active.title_id}
        title={titleData?.title ?? (active.name || `Episode ${active.episode_number}`)}
        synopsis={titleData?.synopsis ?? null}
        views={titleData?.total_unique_views ?? 0}
        contentRating={titleData?.content_rating}
        posterUrl={titleData?.poster_url}
      />
    </div>
  );
}
