// app/watch/[episodeId]/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Lock, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { useAuth } from "@/hooks/useAuth";
import { useUnlockedEpisodeIds } from "@/hooks/useUnlockedEpisodes";
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
  save_count: number;
};

type TitleData = {
  title: string;
  synopsis: string | null;
  content_rating: string | null;
  poster_url: string | null;
  total_unique_views: number;
  free_episode_count: number | null;
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
  // Real viewing time for the view-count rule, tracked separately from the
  // playhead: dragging the bar to 75% must not count as having watched 75%.
  const watchedRef = useRef(0); // seconds actually played this session
  const savingRef = useRef(false); // one save/unsave request at a time
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0); // watchedRef value at the last report

  // Engagement: save (episode-level), comments, share.
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
  const unlockedIds = useUnlockedEpisodeIds(trayEpisodes.map((e) => e.id));

  // Free-by-count episodes are already granted for free by the
  // unlock_episode RPC itself — this is just so the UI can show that up
  // front instead of a "Unlock for N coins" prompt that, when clicked,
  // turns out to charge nothing.
  const isFreeEpisode =
    episode != null && freeCount != null && episode.episode_number <= freeCount;

  useEffect(() => {
    watchedRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
  }, [episodeId]);

  useEffect(() => {
    async function load() {
      const { data: ep } = await supabase
        .from("episodes")
        .select(
          "id, episode_number, name, title_id, video_url, duration_seconds, unlock_cost_coins, comment_count, share_count, save_count"
        )
        .eq("id", episodeId)
        .single();
      setEpisode(ep as EpisodeData);
      if (ep) {
        setCommentCount(ep.comment_count ?? 0);
        setShareCount(ep.share_count ?? 0);
        setSaveCount(ep.save_count ?? 0);
      }

      if (ep) {
        const [{ data: t }, { data: settings }] = await Promise.all([
          supabase
            .from("titles")
            .select("title, synopsis, content_rating, poster_url, total_unique_views, free_episode_count")
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
            .from("episode_saves")
            .select("user_id")
            .eq("user_id", user.id)
            .eq("episode_id", ep.id)
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

  // Episode tray data: every published episode of this title.
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
    }
    loadTray();
  }, [episode?.title_id, supabase]);

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

  // Fresh signed URL for the player to fall back on if a stream stalls or
  // the original link has expired.
  const refreshVideoUrl = useCallback(async () => {
    if (!episode?.video_url) return undefined;
    const { data } = await supabase.storage
      .from("videos")
      .createSignedUrl(episode.video_url, 60 * 60);
    return data?.signedUrl;
  }, [episode?.video_url, supabase]);

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

  // Called with the playhead position on every timeupdate. Only forward
  // movement of about a normal playback tick counts as watching — a seek
  // (either direction) produces a big jump and is ignored.
  function reportProgress(playhead: number, force = false) {
    if (!episode) return;
    const prev = lastPlayheadRef.current;
    lastPlayheadRef.current = playhead;
    if (prev !== null) {
      const delta = playhead - prev;
      if (delta > 0 && delta <= 1.5) watchedRef.current += delta;
    }

    if (!force && watchedRef.current - lastReportedRef.current < 10) return; // throttle
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

    // Keep the Library "History" tab in sync with actual playback progress.
    if (user) {
      const completed = episode.duration_seconds
        ? playhead >= episode.duration_seconds * 0.9
        : false;
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

  async function toggleSave() {
    if (!user || !episode) {
      router.push("/auth/login");
      return;
    }
    // A second tap while the first is still in flight would send an
    // insert and a delete at the same time, and the database could end up
    // disagreeing with the icon.
    if (savingRef.current) return;
    savingRef.current = true;

    const next = !saved;
    setSaved(next);
    setSaveCount((c) => Math.max(0, c + (next ? 1 : -1)));

    let failed = false;
    try {
      // ON CONFLICT DO NOTHING: a stale "not saved" view can't fail on the
      // primary key, and the count trigger only fires on a real insert.
      const { error: err } = next
        ? await supabase
            .from("episode_saves")
            .upsert(
              { user_id: user.id, episode_id: episode.id },
              { onConflict: "user_id,episode_id", ignoreDuplicates: true }
            )
        : await supabase
            .from("episode_saves")
            .delete()
            .eq("user_id", user.id)
            .eq("episode_id", episode.id);
      failed = !!err;
    } catch {
      failed = true;
    } finally {
      savingRef.current = false; // never leave the button locked
    }

    if (failed) {
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
          title={titleData?.title ? `(Ep ${episode.episode_number}) ${titleData.title}` : undefined}
          synopsis={titleData?.synopsis}
          onOpenDetails={openDetails}
          onRequestFreshSrc={refreshVideoUrl}
          storyboardUrl={episode.video_url ? storyboardPublicUrl(supabase, episode.video_url) : null}
          backButton={backButton}
          onTimeUpdate={reportProgress}
          onEnded={() => reportProgress(episode.duration_seconds ?? lastPlayheadRef.current ?? 0, true)}
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
