// components/title/TitleActions.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Bookmark, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

const supabase = createClient();

// Follow (published titles) or Remind me (coming-soon titles). State lives in
// the same tables the My List tabs read, so a tap here shows up there.
export function TitleActions({
  titleId,
  slug,
  status,
  firstEpisodeId,
}: {
  titleId: string;
  slug: string;
  status: string;
  firstEpisodeId: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upcoming = status === "coming_soon";

  useEffect(() => {
    if (!user) {
      setFollowing(false);
      setReminded(false);
      return;
    }
    let ignore = false;
    supabase.rpc("get_title_user_state", { p_title_id: titleId }).then(({ data }) => {
      if (ignore) return;
      const row = Array.isArray(data) ? data[0] : data;
      setFollowing(!!row?.is_following);
      setReminded(!!row?.has_reminder);
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
    if (busy) return;
    const next = !following;
    setBusy(true);
    setError(null);
    setFollowing(next);
    const { error: rpcError } = await supabase.rpc("set_titles_follow", {
      p_title_ids: [titleId],
      p_follow: next,
    });
    if (rpcError) {
      setFollowing(!next);
      setError("Couldn't update your list. Try again.");
    }
    setBusy(false);
  }

  async function toggleReminder() {
    if (!user) return requireAuth();
    if (busy) return;
    const next = !reminded;
    setBusy(true);
    setError(null);
    setReminded(next);
    const { error: rpcError } = await supabase.rpc("set_title_reminders", {
      p_title_ids: [titleId],
      p_on: next,
    });
    if (rpcError) {
      setReminded(!next);
      setError("Couldn't update your reminder. Try again.");
    }
    setBusy(false);
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
          {reminded ? "Reminder set" : "Remind me"}
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
          Watch now
        </Link>
        <Button
          variant="secondary"
          size="icon"
          aria-label={following ? "Unfollow" : "Follow"}
          aria-pressed={following}
          onClick={toggleFollow}
        >
          <span key={String(following)} className="coin-pop">
            <Bookmark size={17} className={following ? "fill-pink text-pink" : ""} />
          </span>
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-crimson">{error}</p>}
    </div>
  );
}
