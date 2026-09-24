"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TitleCard, type TitleCardData } from "@/components/title/TitleCard";
import { Skeleton } from "@/components/ui/Skeleton";
import clsx from "clsx";

type Tab = "list" | "history";

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [watchlist, setWatchlist] = useState<TitleCardData[]>([]);
  const [history, setHistory] = useState<TitleCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      const { data: wl } = await supabase
        .from("watchlist")
        .select("titles(id, slug, title, poster_url, total_unique_views, is_exclusive)")
        .eq("user_id", user!.id);
      setWatchlist((wl ?? []).map((r: any) => r.titles).filter(Boolean));

      const { data: hist } = await supabase
        .from("watch_history")
        .select("titles(id, slug, title, poster_url, total_unique_views, is_exclusive)")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(20);
      setHistory((hist ?? []).map((r: any) => r.titles).filter(Boolean));

      setLoading(false);
    }
    load();
  }, [user, supabase]);

  const items = tab === "list" ? watchlist : history;

  return (
    <div className="fade-in px-4 pt-5">
      <h1 className="font-display text-xl font-semibold text-text">Library</h1>

      <div className="mt-4 flex gap-5 border-b border-border">
        {(["list", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "border-b-2 pb-2.5 text-[14px] font-medium transition-colors",
              tab === t ? "border-gold text-text" : "border-transparent text-muted"
            )}
          >
            {t === "list" ? "My List" : "History"}
          </button>
        ))}
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
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      )}

      {!loading && user && (
        <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4">
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
  );
}
