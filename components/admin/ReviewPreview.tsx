// components/admin/ReviewPreview.tsx
//
// Lets an admin watch what a creator submitted before approving it. Lists
// every episode of the project (promo clip, then 1..N) and plays the picked
// one from a short-lived signed URL, so unpublished videos stay private.

"use client";

import { useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";

type Ep = { id: string; episode_number: number; name: string | null; video_url: string | null };

export function ReviewPreview({ titleId, posterUrl }: { titleId: string; posterUrl?: string | null }) {
  const { t: tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [eps, setEps] = useState<Ep[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function play(ep: Ep) {
    setActiveId(ep.id);
    setUrl(null);
    setError(false);
    if (!ep.video_url) return;
    if (/^https?:\/\//i.test(ep.video_url)) {
      setUrl(ep.video_url);
      return;
    }
    const { data, error: err } = await createClient().storage.from("videos").createSignedUrl(ep.video_url, 60 * 60);
    if (err || !data?.signedUrl) setError(true);
    else setUrl(data.signedUrl);
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      setUrl(null);
      return;
    }
    setOpen(true);
    if (eps) return;
    setBusy(true);
    const { data, error: err } = await createClient()
      .from("episodes")
      .select("id, episode_number, name, video_url")
      .eq("title_id", titleId)
      .order("episode_number", { ascending: true });
    setBusy(false);
    if (err) {
      setError(true);
      setEps([]);
      return;
    }
    const list = (data as Ep[]) ?? [];
    setEps(list);
    const first = list.find((e) => e.video_url);
    if (first) play(first);
  }

  return (
    <div className="mt-3">
      <Button size="sm" variant="secondary" onClick={toggle}>
        {open ? tr("admin.hideVideo") : tr("admin.watchVideo")}
      </Button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {busy && <p className="text-[12px] text-muted">{tr("admin.loadingVideo")}</p>}

          {eps && eps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {eps.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={!e.video_url}
                  onClick={() => play(e)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-40",
                    activeId === e.id ? "border-pink bg-pink/10 text-text" : "border-border text-muted hover:text-text"
                  )}
                >
                  {e.episode_number === 0 ? tr("admin.promoClip") : tr("admin.episodeN", { n: e.episode_number })}
                </button>
              ))}
            </div>
          )}

          {url && (
            <video
              key={url}
              src={url}
              poster={posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="max-h-[70vh] w-full rounded-md bg-black"
            />
          )}

          {error && <p className="text-[12px] text-crimson">{tr("admin.videoLoadFailed")}</p>}
          {eps && eps.length === 0 && !error && <p className="text-[12px] text-muted">{tr("admin.noVideo")}</p>}
        </div>
      )}
    </div>
  );
}
