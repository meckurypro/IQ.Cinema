// app/watch/[episodeId]/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Lock, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";

type EpisodeData = {
  id: string;
  episode_number: number;
  name: string | null;
  title_id: string;
  video_url: string | null;
  duration_seconds: number | null;
  unlock_cost_coins: number | null;
  comment_count: number;
  share_count: number;
};

type TitleData = {
  title: string;
  synopsis: string | null;
  content_rating: string | null;
  poster_url: string | null;
  total_unique_views: number;
  free_episode_count: number | null;
  save_count: number;
};

function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("iq-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("iq-device-id", id);
  }
  return id;
}

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [titleData, setTitleData] = useState<TitleData | null>(null);
  const [freeCount, setFreeCount] = useState<number | null>(null);
  const [defaultUnlockCost, setDefaultUnlockCost] = useState(30);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastReportedRef = useRef(0);

  // Engagement: save (title-level, mirrors My List), comments, share.
  const [saved, setSaved] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [shareToast, setShareToast] = useState(false);

  // Episode tray: the full episode list for this title, plus which of them
  // this viewer has paid to unlock (free-by-count ones don't need an entry).
  const [trayEpisodes, setTrayEpisodes] = useState<TrayEpisode[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  // Free-by-count episodes are already granted for free by the
  // unlock_episode RPC itself — this is just so the UI can show that up
  // front instead of a "Unlock for N coins" prompt that, when clicked,
  // turns out to charge nothing.
  const isFreeEpisode =
    episode != null && freeCount != null && episode.episode_number <= freeCount;

  useEffect(() => {
    async function load() {
      const { data: ep } = await supabase
        .from("episodes")
        .select(
          "id, episode_number, name, title_id, video_url, duration_seconds, unlock_cost_coins, comment_count, share_count"
        )
        .eq("id", episodeId)
        .single();
      setEpisode(ep as EpisodeData);
      if (ep) {
        setCommentCount(ep.comment_count ?? 0);
        setShareCount(ep.share_count ?? 0);
      }

      if (ep) {
        const [{ data: t }, { data: settings }] = await Promise.all([
          supabase
            .from("titles")
            .select("title, synopsis, content_rating, poster_url, total_unique_views, free_episode_count, save_count")
            .eq("id", ep.title_id)
            .single(),
          supabase
            .from("platform_settings")
            .select("default_free_episodes, default_episode_unlock_coins")
            .single(),
        ]);
        setTitleData((t as TitleData) ?? null);
        setFreeCount(t?.free_episode_count ?? settings?.default_free_episodes ?? 4);
        setDefaultUnlockCost(settings?.default_episode_unlock_coins ?? 30);
        setSaveCount(t?.save_count ?? 0);
      }

      if (user && ep) {
        const [{ data: unlock }, { data: saveRow }] = await Promise.all([
          supabase
            .from("episode_unlocks")
            .select("id")
            .eq("user_id", user.id)
            .eq("episode_id", episodeId)
            .maybeSingle(),
          supabase
            .from("watchlist")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("title_id", ep.title_id)
            .maybeSingle(),
        ]);
        setUnlocked(!!unlock);
        setSaved(!!saveRow);
      } else {
        setUnlocked(false);
        setSaved(false);
      }
    }
    if (episodeId) load();
  }, [episodeId, user, supabase]);

  // Episode tray data: every published episode of this title, plus which
  // ones this viewer has already paid to unlock.
  useEffect(() => {
    async function loadTray() {
      if (!episode?.title_id) return;
      const { data: eps } = await supabase
        .from("episodes")
        .select("id, episode_number, name, unlock_cost_coins")
        .eq("title_id", episode.title_id)
        .eq("status", "published")
        .order("episode_number", { ascending: true });
      setTrayEpisodes(eps ?? []);

      if (user && eps?.length) {
        const { data: unlocks } = await supabase
          .from("episode_unlocks")
          .select("episode_id")
          .eq("user_id", user.id)
          .in(
            "episode_id",
            eps.map((e) => e.id)
          );
        setUnlockedIds(new Set((unlocks ?? []).map((u) => u.episode_id)));
      } else {
        setUnlockedIds(new Set());
      }
    }
    loadTray();
  }, [episode?.title_id, user, supabase]);

  // Free episodes need no coin/subscription decision from the viewer — grant
  // them automatically the moment we know both that it's free and that the
  // viewer isn't already unlocked, instead of showing a paywall screen for
  // something that was never going to cost anything.
  useEffect(() => {
    if (isFreeEpisode && user && unlocked === false && !unlocking) {
      handleUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeEpisode, user, unlocked]);

  // Resolve a short-lived signed URL only once the episode is confirmed unlocked
  // — the 'videos' bucket is private, so there's no public URL to leak.
  useEffect(() => {
    async function resolveSignedUrl() {
      if (!unlocked || !episode?.video_url) return;
      const { data } = await supabase.storage
        .from("videos")
        .createSignedUrl(episode.video_url, 60 * 60); // 1 hour
      if (data?.signedUrl) setVideoUrl(data.signedUrl);
    }
    resolveSignedUrl();
  }, [unlocked, episode?.video_url, supabase]);

  // View counts move server-side as people watch; the copy fetched at page
  // load goes stale, so refresh it whenever the details sheet is opened.
  async function openDetails() {
    setShowDetails(true);
    if (!episode) return;
    const { data } = await supabase
      .from("titles")
      .select("total_unique_views, synopsis, content_rating")
      .eq("id", episode.title_id)
      .single();
    if (data) setTitleData((t) => (t ? { ...t, ...data } : t));
  }

  async function handleUnlock() {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setUnlocking(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("unlock_episode", {
      p_user_id: user.id,
      p_episode_id: episodeId,
    });
    setUnlocking(false);

    if (rpcError || !data?.ok) {
      if (data?.error === "insufficient_coins") {
        router.push("/wallet");
        return;
      }
      setError(rpcError?.message || data?.error || "Could not unlock episode");
      return;
    }
    setUnlocked(true);
  }

  function reportProgress(seconds: number) {
    if (!episode) return;
    if (Math.abs(seconds - lastReportedRef.current) < 10) return; // throttle
    lastReportedRef.current = seconds;
    supabase.rpc("record_play", {
      p_user_id: user?.id ?? null,
      p_device_id: getDeviceId(),
      p_episode_id: episode.id,
      p_watched_seconds: Math.floor(seconds),
    });

    // Keep the Library "History" tab in sync with actual playback progress.
    if (user) {
      const completed = episode.duration_seconds
        ? seconds >= episode.duration_seconds * 0.9
        : false;
      supabase
        .from("watch_history")
        .upsert(
          {
            user_id: user.id,
            episode_id: episode.id,
            title_id: episode.title_id,
            progress_seconds: Math.floor(seconds),
            completed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,episode_id" }
        )
        .then(() => {});
    }
  }

  async function toggleSave() {
    if (!user || !episode) {
      router.push("/auth/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    setSaveCount((c) => Math.max(0, c + (next ? 1 : -1)));

    const { error: err } = next
      ? await supabase.from("watchlist").insert({ user_id: user.id, title_id: episode.title_id })
      : await supabase
          .from("watchlist")
          .delete()
          .eq("user_id", user.id)
          .eq("title_id", episode.title_id);

    if (err) {
      setSaved(!next);
      setSaveCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  }

  async function handleShare() {
    if (!episode) return;
    const url = typeof window !== "undefined" ? `${window.location.origin}/watch/${episode.id}` : "";

    const { data } = await supabase.rpc("record_episode_share", { p_episode_id: episode.id });
    setShareCount(data?.ok ? data.share_count : (c: number) => c + 1);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: episode.name ?? `Episode ${episode.episode_number}`,
          url,
        });
        return;
      } catch {
        // User canceled the native share sheet — fall through to nothing further.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 1800);
    } catch {
      // Clipboard unavailable — silently no-op rather than block the UI.
    }
  }

  if (!episode || unlocked === null) {
    return (
      <div className="flex h-dvh flex-col bg-black">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    );
  }

  const backButton = (
    <button
      onClick={() => router.back()}
      aria-label="Back"
      className="absolute left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <ArrowLeft size={18} />
    </button>
  );

  return (
    <div className="relative h-dvh bg-black">
      {!unlocked && <div className="relative z-10">{backButton}</div>}

      {unlocked ? (
        <VideoPlayer
          src={videoUrl ?? undefined}
          autoPlay
          title={titleData?.title}
          synopsis={titleData?.synopsis}
          onOpenDetails={openDetails}
          backButton={backButton}
          onTimeUpdate={reportProgress}
          onEnded={() => episode.duration_seconds && reportProgress(episode.duration_seconds)}
          actionRail={
            <ActionRail
              saved={saved}
              saveCount={saveCount}
              onToggleSave={toggleSave}
              commentCount={commentCount}
              onOpenComments={() => setShowComments(true)}
              shareCount={shareCount}
              onShare={handleShare}
              onOpenEpisodes={() => setShowTray(true)}
              episodeNumber={episode.episode_number}
            />
          }
        />
      ) : isFreeEpisode ? (
        user ? (
          // Free episodes are auto-unlocked as soon as we know they're free
          // (see the effect above) — this only shows for the brief moment
          // that grant takes, never a paywall.
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/60">Loading…</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div>
              <p className="font-display text-lg font-semibold text-white">
                Episode {episode.episode_number} is free to watch
              </p>
              <p className="mt-1 text-sm text-white/60">Sign in to start watching.</p>
            </div>
            <Button variant="primary" size="lg" onClick={() => router.push("/auth/login")}>
              Sign in
            </Button>
          </div>
        )
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Lock size={22} className="text-white" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-white">
              Episode {episode.episode_number} is locked
            </p>
            <p className="mt-1 text-sm text-white/60">
              Unlock with coins, or subscribe for unlimited access.
            </p>
          </div>
          {error && <p className="text-sm text-crimson">{error}</p>}
          <Button variant="primary" size="lg" disabled={unlocking} onClick={handleUnlock}>
            <Zap size={16} className="fill-current" />
            Unlock for {episode.unlock_cost_coins ?? defaultUnlockCost} coins
          </Button>
          <button
            onClick={() => router.push("/wallet")}
            className="text-sm font-medium text-white/70 underline underline-offset-4"
          >
            See subscription plans
          </button>
        </div>
      )}

      {shareToast && (
        <div className="absolute inset-x-0 bottom-28 z-30 flex justify-center">
          <span className="rounded-full bg-black/70 px-3.5 py-1.5 text-[12px] font-medium text-white">
            Link copied
          </span>
        </div>
      )}

      <CommentsSheet
        open={showComments}
        onClose={() => setShowComments(false)}
        episodeId={episode.id}
        count={commentCount}
        onCountChange={setCommentCount}
      />

      <EpisodeTray
        open={showTray}
        onClose={() => setShowTray(false)}
        episodes={trayEpisodes}
        currentEpisodeId={episode.id}
        freeCount={freeCount ?? 4}
        unlockedIds={unlockedIds}
        defaultCost={defaultUnlockCost}
      />

      <TitleDetailsSheet
        open={showDetails}
        onClose={() => setShowDetails(false)}
        titleId={episode.title_id}
        title={titleData?.title ?? (episode.name || `Episode ${episode.episode_number}`)}
        synopsis={titleData?.synopsis ?? null}
        views={titleData?.total_unique_views ?? 0}
        contentRating={titleData?.content_rating}
        posterUrl={titleData?.poster_url}
      />
    </div>
  );
}
