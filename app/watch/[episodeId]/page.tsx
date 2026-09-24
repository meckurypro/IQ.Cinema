"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Lock, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type EpisodeData = {
  id: string;
  episode_number: number;
  name: string | null;
  title_id: string;
  video_url: string | null;
  duration_seconds: number | null;
  unlock_cost_coins: number | null;
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
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReportedRef = useRef(0);

  useEffect(() => {
    async function load() {
      const { data: ep } = await supabase
        .from("episodes")
        .select("id, episode_number, name, title_id, video_url, duration_seconds, unlock_cost_coins")
        .eq("id", episodeId)
        .single();
      setEpisode(ep as EpisodeData);

      if (user) {
        const { data: unlock } = await supabase
          .from("episode_unlocks")
          .select("id")
          .eq("user_id", user.id)
          .eq("episode_id", episodeId)
          .maybeSingle();
        setUnlocked(!!unlock);
      } else {
        setUnlocked(false);
      }
    }
    if (episodeId) load();
  }, [episodeId, user, supabase]);

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
  }

  if (!episode || unlocked === null) {
    return (
      <div className="flex h-dvh flex-col bg-black">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    );
  }

  return (
    <div className="relative h-dvh bg-black">
      <button
        onClick={() => router.back()}
        aria-label="Back"
        className="absolute left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <ArrowLeft size={18} />
      </button>

      {unlocked ? (
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          controls
          autoPlay
          playsInline
          onTimeUpdate={(e) => reportProgress(e.currentTarget.currentTime)}
          onEnded={() => episode.duration_seconds && reportProgress(episode.duration_seconds)}
          src={videoUrl ?? undefined}
        />
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
          <Button variant="gold" size="lg" disabled={unlocking} onClick={handleUnlock}>
            <Zap size={16} className="fill-current" />
            Unlock for {episode.unlock_cost_coins ?? 30} coins
          </Button>
          <button
            onClick={() => router.push("/wallet")}
            className="text-sm font-medium text-white/70 underline underline-offset-4"
          >
            See subscription plans
          </button>
        </div>
      )}
    </div>
  );
}
