// app/library/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TitleCard, type TitleCardData } from "@/components/title/TitleCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import clsx from "clsx";

type Tab = "list" | "history";

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [watchlist, setWatchlist] = useState<TitleCardData[]>([]);
  const [history, setHistory] = useState<TitleCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ list: null, history: null });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Measure the actual rendered button rather than guessing pixel widths for
  // "My List" vs "History" — robust to font metrics, locale, or copy changes.
  useLayoutEffect(() => {
    const btn = tabRefs.current[tab];
    const bar = tabBarRef.current;
    if (!btn || !bar) return;
    setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [tab]);

  const load = useCallback(async () => {
    if (!user) return;
    // These two don't depend on each other — fire them together instead
    // of waiting on one round trip before starting the next.
    const [{ data: wl }, { data: saves }, { data: hist }] = await Promise.all([
      // Legacy title-level saves, from before saving moved to episodes.
      supabase
        .from("watchlist")
        .select("titles(id, slug, title, poster_url, total_unique_views, is_exclusive)")
        .eq("user_id", user.id),
      // Current behavior: saves are per episode; My List shows their titles.
      supabase
        .from("episode_saves")
        .select("created_at, episodes(titles(id, slug, title, poster_url, total_unique_views, is_exclusive))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("watch_history")
        .select("titles(id, slug, title, poster_url, total_unique_views, is_exclusive)")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);
    // Newest episode saves first, then legacy ones, one card per title.
    const seen = new Set<string>();
    const merged: TitleCardData[] = [];
    for (const t of [
      ...(saves ?? []).map((r: any) => r.episodes?.titles),
      ...(wl ?? []).map((r: any) => r.titles),
    ]) {
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    setWatchlist(merged);
    setHistory((hist ?? []).map((r: any) => r.titles).filter(Boolean));
  }, [user, supabase]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let ignore = false;
    load().then(() => {
      // If the user changed (or we unmounted) while this was in flight,
      // drop the result instead of overwriting newer state with stale data.
      if (!ignore) setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [user, load]);

  const items = tab === "list" ? watchlist : history;

  return (
    <PullToRefresh onRefresh={load}>
      <div className="fade-in px-4 pt-5">
        <h1 className="font-display text-2xl font-semibold text-text">Library</h1>

        <div ref={tabBarRef} className="relative mt-4 flex gap-5 border-b border-border">
          {(["list", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              onClick={() => setTab(t)}
              className={clsx(
                "pb-2.5 text-[14px] font-medium transition-colors",
                tab === t ? "text-pink" : "text-muted"
              )}
            >
              {t === "list" ? "My List" : "History"}
            </button>
          ))}
          {/* Sliding underline instead of an instant color/border swap on tap. */}
          <div
            className="absolute bottom-0 h-0.5 bg-pink transition-all duration-300 ease-out"
            style={{ left: underline.left, width: underline.width }}
          />
        </div>

        {!user && !authLoading && (
          <div className="mt-10 text-center">
            <p className="text-sm text-muted">Sign in to build your library.</p>
            <Link
              href="/auth/login"
              className="mt-3 inline-block text-sm font-medium text-text underline underline-offset-4"
            >
              Sign in
            </Link>
          </div>
        )}

        {(loading || authLoading) && user && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="aspect-[9/16] w-full" />
            ))}
          </div>
        )}

        {!loading && user && (
          <div key={tab} className="fade-in mt-5 grid grid-cols-3 gap-x-3 gap-y-4">
            {items.map((t) => (
              <TitleCard key={t.id} title={t} size="sm" />
            ))}
            {!items.length && (
              <p className="col-span-3 mt-8 text-center text-sm text-muted">
                {tab === "list" ? "Nothing saved yet." : "No watch history yet."}
              </p>
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
