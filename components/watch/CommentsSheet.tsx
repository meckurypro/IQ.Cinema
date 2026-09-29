// components/watch/CommentsSheet.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useI18n } from "@/hooks/useI18n";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null; username: string; avatar_url: string | null } | null;
};

function timeAgo(iso: string, t: ReturnType<typeof useI18n>["t"]) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("common.now");
  if (s < 3600) return t("common.minutesShort", { n: Math.floor(s / 60) });
  if (s < 86400) return t("common.hoursShort", { n: Math.floor(s / 3600) });
  return t("common.daysShort", { n: Math.floor(s / 86400) });
}

export function CommentsSheet({
  open,
  onClose,
  episodeId,
  count,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  count: number;
  onCountChange: (next: number) => void;
}) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("episode_comments")
      .select("id, body, created_at, user_id, profiles(display_name, username, avatar_url)")
      .eq("episode_id", episodeId)
      .order("created_at", { ascending: false })
      .limit(50);
    setComments((data as unknown as Comment[]) ?? []);
  }, [episodeId, supabase]);

  // Re-fetch every time the sheet opens rather than once on mount — the
  // count (and comment list) may have changed while it was closed, e.g.
  // after a swipe to another episode and back.
  useEffect(() => {
    if (open) {
      setComments(null);
      load();
    }
  }, [open, load]);

  async function submit() {
    const body = draft.trim();
    if (!body || !user || posting) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("episode_comments")
      .insert({ episode_id: episodeId, user_id: user.id, body })
      .select("id, body, created_at, user_id, profiles(display_name, username, avatar_url)")
      .single();
    setPosting(false);
    if (!error && data) {
      setComments((prev) => [data as unknown as Comment, ...(prev ?? [])]);
      setDraft("");
      onCountChange(count + 1);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("watch.commentsTitle", { n: count.toLocaleString(lang) })}>
      <div className="flex flex-col gap-3 px-3 pb-2 pt-1">
        {comments === null && [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}

        {comments !== null && comments.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {t("watch.noComments")}
          </p>
        )}

        {comments?.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-raised">
              {c.profiles?.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-text">
                {c.profiles?.display_name || c.profiles?.username || t("watch.viewer")}
                <span className="ml-2 font-normal text-muted">{timeAgo(c.created_at, t)}</span>
              </p>
              <p className="mt-0.5 break-words text-[14px] text-text/90">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-border bg-surface px-4 pt-2.5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={500}
          placeholder={user ? t("watch.addComment") : t("watch.signInToComment")}
          disabled={!user}
          className="h-10 flex-1 rounded-full border border-border bg-surface-raised px-4 text-[14px] text-text outline-none placeholder:text-muted disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={!user || !draft.trim() || posting}
          aria-label={t("watch.postComment")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-pink to-crimson text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </BottomSheet>
  );
}
