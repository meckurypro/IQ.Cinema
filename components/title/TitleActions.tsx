// components/title/TitleActions.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Bookmark, ChevronRight, ListVideo, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { useUnlockedEpisodeIds } from "@/hooks/useUnlockedEpisodes";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

// Follow (published titles) or Remind me (coming-soon titles). State lives in
// the same tables the My List tabs read, so a tap here shows up there.
export function TitleActions({
  titleId,
  slug,
  status,
  episodes,
  freeCount,
  defaultCost,
}: {
  titleId: string;
  slug: string;
  status: string;
  // Published episodes, in order. Feeds both "Watch now" (the first one) and
  // the shared episode tray, so there is a single source for both.
  episodes: TrayEpisode[];
  freeCount: number;
  defaultCost: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [reminded, setReminded] = useState(false);
  // A ref, not state: two taps in the same frame both see the old state value
  // and would both get past a state-based guard.
  const busyRef = useRef(false);
  // The viewer's tap is newer than the initial state lookup, so a slow lookup
  // answering afterwards must not undo it.
  const touched = useRef({ following: false, reminded: false });
  const [error, setError] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayLoaded, setTrayLoaded] = useState(false);
  // Which episodes this viewer has paid to unlock — only looked up once the
  // tray has actually been opened, so it costs nothing on page load.
  const unlockedIds = useUnlockedEpisodeIds(
    episodes.map((e) => e.id),
    trayLoaded
  );
  const firstEpisodeId = episodes[0]?.id ?? null;
  const upcoming = status === "coming_soon";

  useEffect(() => {
    touched.current = { following: false, reminded: false };
    if (!user) {
      setFollowing(false);
      setReminded(false);
      return;
    }
    let ignore = false;
    supabase.rpc("get_title_user_state", { p_title_id: titleId }).then(({ data }) => {
      if (ignore) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!touched.current.following) setFollowing(!!row?.is_following);
      if (!touched.current.reminded) setReminded(!!row?.has_reminder);
    });
    return () => {
      ignore = true;
    };
  }, [user, titleId]);

  function requireAuth() {
    router.push(`/auth/login?next=${encodeURIComponent(`/title/${slug}`)}`);
  }

  async function toggleFollow() {
    if (!user) return requireAuth();
    if (busyRef.current) return;
    busyRef.current = true;
    touched.current.following = true;
    const next = !following;
    setError(null);
    setFollowing(next);
    try {
      const { error: rpcError } = await supabase.rpc("set_titles_follow", {
        p_title_ids: [titleId],
        p_follow: next,
      });
      if (rpcError) throw rpcError;
    } catch {
      setFollowing(!next);
      setError(t("title.listError"));
    } finally {
      busyRef.current = false; // never leave the button locked
    }
  }

  async function toggleReminder() {
    if (!user) return requireAuth();
    if (busyRef.current) return;
    busyRef.current = true;
    touched.current.reminded = true;
    const next = !reminded;
    setError(null);
    setReminded(next);
    try {
      const { error: rpcError } = await supabase.rpc("set_title_reminders", {
        p_title_ids: [titleId],
        p_on: next,
      });
      if (rpcError) throw rpcError;
    } catch {
      setReminded(!next);
      setError(t("title.reminderError"));
    } finally {
      busyRef.current = false;
    }
  }

  if (upcoming) {
    return (
      <div className="mt-4">
        <Button
          variant={reminded ? "secondary" : "primary"}
          size="md"
          className="w-full"
          onClick={toggleReminder}
          aria-pressed={reminded}
        >
          {reminded ? <BellRing size={17} className="fill-pink text-pink" /> : <Bell size={17} />}
          {reminded ? t("title.reminderSet") : t("title.remindMe")}
        </Button>
        {error && <p className="mt-2 text-[12px] text-crimson">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Link
          href={firstEpisodeId ? `/watch/${firstEpisodeId}` : "#"}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-gradient-to-r from-pink to-crimson text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(var(--pink)_/_0.65)] transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.98] active:brightness-95"
        >
          <Play size={16} className="fill-white" />
          {t("title.watchNow")}
        </Link>
        <Button
          variant="secondary"
          size="icon"
          aria-label={following ? t("title.unfollow") : t("title.follow")}
          aria-pressed={following}
          onClick={toggleFollow}
        >
          <span key={String(following)} className="coin-pop">
            <Bookmark size={17} className={following ? "fill-pink text-pink" : ""} />
          </span>
        </Button>
      </div>

      {/* Episodes live in the same tray the player uses — one list, one place. */}
      {episodes.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setTrayLoaded(true);
            setTrayOpen(true);
          }}
          className="mt-3 flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors active:bg-surface-raised"
        >
          <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
            <ListVideo size={18} className="text-muted" />
            {t("title.episodes")}
          </span>
          <ChevronRight size={18} className="text-muted" />
        </button>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("title.noEpisodes")}</p>
      )}

      {error && <p className="mt-2 text-[12px] text-crimson">{error}</p>}

      <EpisodeTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        episodes={episodes}
        freeCount={freeCount}
        unlockedIds={unlockedIds}
        defaultCost={defaultCost}
      />
    </div>
  );
}
