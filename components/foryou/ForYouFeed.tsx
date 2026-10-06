// components/foryou/ForYouFeed.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Play, ChevronRight, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { reportPlay } from "@/lib/reportPlay";
import { useAuth } from "@/hooks/useAuth";
import { titlePath } from "@/lib/links";
import { formatCount } from "@/lib/format";
import { DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { EMPTY_COPY_KEY, parseForYouTab, rpcTabFor, type ForYouTab } from "@/lib/forYouTabs";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { EpisodeFeed } from "@/components/watch/EpisodeFeed";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";
import { ForYouHeader } from "@/components/foryou/ForYouHeader";
import { ForYouSearch, type SearchPromo } from "@/components/foryou/ForYouSearch";
import { useI18n } from "@/hooks/useI18n";
import { useFeedKeyboard } from "@/hooks/useFeedKeyboard";
import { FeedNavArrows } from "@/components/shared/FeedNavArrows";

type PromoItem = {
  episode_id: string;
  episode_number: number;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  save_count: number;
  comment_count: number;
  share_count: number;
  title_id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  poster_url: string | null;
  content_rating: string | null;
  category: string | null;
  tags: string[] | null;
  total_episodes: number;
  total_unique_views: number;
  published_at: string | null;
  // Only set by get_for_you_feed_v2 (not by the by-slug lookup).
  is_new?: boolean;
  feed_rank?: number;
  recent_views?: number;
};

type Engagement = { saved: boolean; saveCount: number; commentCount: number; shareCount: number };

const PAGE_SIZE = 8;

function engagementFor(item: PromoItem): Engagement {
  return {
    saved: false,
    saveCount: item.save_count ?? 0,
    commentCount: item.comment_count ?? 0,
    shareCount: item.share_count ?? 0,
  };
}

export function ForYouFeed() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const supabase = createClient();

  // Tab + collection category live in state (seeded from ?tab=), so switching
  // never navigates — it just swaps which promo episodes fill the feed.
  const [tab, setTab] = useState<ForYouTab>(() => parseForYouTab(searchParams.get("tab")));
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);

  const [items, setItems] = useState<PromoItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [trayTitleId, setTrayTitleId] = useState<string | null>(null);
  const [trayEpisodes, setTrayEpisodes] = useState<TrayEpisode[]>([]);
  const [trayFreeCount, setTrayFreeCount] = useState(4);
  const [trayDefaultCost, setTrayDefaultCost] = useState(30);
  const [trayUnlockedIds, setTrayUnlockedIds] = useState<Set<string>>(new Set());
  const [shareToast, setShareToast] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // "Watch Full Movie" plays the title's episodes in a full-screen layer on
  // top of the feed — the route never changes, so closing lands back on the
  // same promo.
  const [fullEpisodeId, setFullEpisodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const savingRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef(0);
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0);
  const injectedSlug = useRef<string | null>(null);
  // Rows fetched so far for the current tab (offset pagination — a ranked
  // list has no stable timestamp cursor), and a token so a slow response for
  // a tab we've already left can't overwrite the current one.
  const offsetRef = useRef(0);
  const feedTokenRef = useRef(0);

  const seedEngagement = useCallback((batch: PromoItem[]) => {
    setEngagement((prev) => {
      const next = { ...prev };
      for (const it of batch) if (!next[it.episode_id]) next[it.episode_id] = engagementFor(it);
      return next;
    });
  }, []);

  const fetchPage = useCallback(
    async (offset: number): Promise<PromoItem[] | null> => {
      const { data, error } = await supabase.rpc("get_for_you_feed_v2", {
        p_tab: rpcTabFor(tab),
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_category: tab === "collections" ? category : null,
      });
      if (!error) return (data as PromoItem[]) ?? [];
      // v2 not deployed on this database yet: the original newest-first feed
      // still serves the default view, so For You never goes blank.
      if (tab === "for_you" && offset === 0) {
        const legacy = await supabase.rpc("get_for_you_feed", { p_limit: PAGE_SIZE, p_before: null });
        if (!legacy.error) return (legacy.data as PromoItem[]) ?? [];
      }
      console.error("get_for_you_feed_v2 failed", error.message);
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, category]
  );

  // First page — reruns whenever the tab or collection category changes.
  useEffect(() => {
    const token = ++feedTokenRef.current;
    setItems(null);
    setActiveId(null);
    setExhausted(false);
    setLoadingMore(false);
    setShowComments(false);
    setShowDetails(false);
    setShowTray(false);
    offsetRef.current = 0;
    containerRef.current?.scrollTo({ top: 0 });
    (async () => {
      const batch = (await fetchPage(0)) ?? [];
      if (token !== feedTokenRef.current) return;
      offsetRef.current = batch.length;
      setItems(batch);
      if (batch[0]) setActiveId(batch[0].episode_id);
      seedEngagement(batch);
      if (batch.length < PAGE_SIZE) setExhausted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category]);

  // Keep the URL shareable (/for-you?tab=trending) without triggering a
  // navigation or re-render.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "for_you") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [tab]);

  function changeTab(next: ForYouTab) {
    if (next === tab) return;
    setTab(next);
  }

  // Splice a promo in right after the current slide (or just scroll to it if
  // it's already in the feed) and make it the active one. Used by the
  // "Similar titles" deep link and by search results.
  const injectPromo = useCallback(
    (row: PromoItem) => {
      setItems((prev) => {
        const cur = prev ?? [];
        if (cur.some((i) => i.episode_id === row.episode_id)) return cur;
        const idx = cur.findIndex((i) => i.episode_id === activeId);
        const next = [...cur];
        next.splice(idx >= 0 ? idx + 1 : cur.length, 0, row);
        return next;
      });
      seedEngagement([row]);
      setActiveId(row.episode_id);
      // Two frames: the first lets React commit the new slide, the second
      // lets layout settle before we scroll to it.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          slideRefs.current.get(row.episode_id)?.scrollIntoView({ block: "start" });
        })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, seedEngagement]
  );

  // A "Similar titles" tap from inside the details sheet lands here as
  // ?title=<slug> — fetch just that title's promo, splice it in right after
  // the current slide, and scroll to it. Same sheet, feed keeps going.
  useEffect(() => {
    const slug = searchParams.get("title");
    if (!slug || slug === injectedSlug.current || !items) return;
    injectedSlug.current = slug;
    (async () => {
      const { data } = await supabase.rpc("get_for_you_promo_by_slug", { p_slug: slug });
      const row = (Array.isArray(data) ? data[0] : data) as PromoItem | undefined;
      if (!row) return;
      injectPromo(row);
      router.replace(tab === "for_you" ? "/for-you" : `/for-you?tab=${tab}`, { scroll: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  // System Back closes the search overlay instead of leaving For You.
  useEffect(() => {
    if (!showSearch) return;
    const marker = `search-${Date.now()}`;
    window.history.pushState({ ...(window.history.state ?? {}), __search: marker }, "", window.location.href);
    const onPop = () => {
      if (window.history.state?.__search !== marker) setShowSearch(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from the on-screen button / a result tap: drop our entry.
      if (window.history.state?.__search === marker) window.history.back();
    };
  }, [showSearch]);

  function openSearchResult(row: SearchPromo) {
    setShowSearch(false);
    injectPromo(row as PromoItem);
  }

  // Signed URL for the active slide + its immediate neighbors.
  useEffect(() => {
    if (!items || !activeId) return;
    const idx = items.findIndex((i) => i.episode_id === activeId);
    if (idx < 0) return;
    const targets = [items[idx - 1], items[idx], items[idx + 1]].filter(
      (i): i is PromoItem => !!i && !!i.video_url && !videoUrls[i.episode_id]
    );
    if (!targets.length) return;
    let ignore = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (it) => {
          const { data } = await supabase.storage.from("videos").createSignedUrl(it.video_url!, 60 * 60);
          return [it.episode_id, data?.signedUrl] as const;
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
  }, [activeId, items, supabase]);

  const refreshVideoUrl = useCallback(
    async (episodeId: string) => {
      const it = items?.find((i) => i.episode_id === episodeId);
      if (!it?.video_url) return undefined;
      const { data } = await supabase.storage.from("videos").createSignedUrl(it.video_url, 60 * 60);
      if (data?.signedUrl) setVideoUrls((prev) => ({ ...prev, [episodeId]: data.signedUrl }));
      return data?.signedUrl;
    },
    [items, supabase]
  );

  // Which slide is active, and — once we're within two of the end —
  // whether to fetch the next page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !items?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = entry.target.getAttribute("data-episode-id");
            if (id) setActiveId(id);
          }
        }
      },
      { root: container, threshold: [0.6] }
    );
    for (const el of slideRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    if (!items || !activeId || exhausted || loadingMore) return;
    const idx = items.findIndex((i) => i.episode_id === activeId);
    if (idx < items.length - 2) return;
    setLoadingMore(true);
    const token = feedTokenRef.current;
    fetchPage(offsetRef.current).then((batch) => {
      if (token !== feedTokenRef.current) return;
      if (!batch) {
        setLoadingMore(false);
        return;
      }
      offsetRef.current += batch.length;
      const existing = new Set(items.map((i) => i.episode_id));
      const fresh = batch.filter((i) => !existing.has(i.episode_id));
      if (fresh.length) {
        setItems((prev) => [...(prev ?? []), ...fresh]);
        seedEngagement(fresh);
      }
      if (batch.length < PAGE_SIZE) setExhausted(true);
      setLoadingMore(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, items, exhausted, loadingMore]);

  useEffect(() => {
    watchedRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
  }, [activeId]);

  function reportProgress(item: PromoItem, playhead: number, force = false) {
    const prev = lastPlayheadRef.current;
    lastPlayheadRef.current = playhead;
    if (prev !== null) {
      const delta = playhead - prev;
      if (delta > 0 && delta <= 1.5) watchedRef.current += delta;
    }
    if (!force && watchedRef.current - lastReportedRef.current < 10) return;
    if (force && watchedRef.current === lastReportedRef.current) return;
    lastReportedRef.current = watchedRef.current;

    void reportPlay(supabase, {
      userId: user?.id ?? null,
      episodeId: item.episode_id,
      watchedSeconds: watchedRef.current,
    });
  }

  function goToNext(item: PromoItem) {
    if (!items) return;
    const idx = items.findIndex((i) => i.episode_id === item.episode_id);
    const nextEl = items[idx + 1] && slideRefs.current.get(items[idx + 1].episode_id);
    nextEl?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function toggleSave(item: PromoItem) {
    if (!user) return router.push("/auth/login");
    if (savingRef.current.has(item.episode_id)) return;
    savingRef.current.add(item.episode_id);
    const current = engagement[item.episode_id];
    const next = !current?.saved;
    setEngagement((prev) => ({
      ...prev,
      [item.episode_id]: {
        ...prev[item.episode_id],
        saved: next,
        saveCount: Math.max(0, (prev[item.episode_id]?.saveCount ?? 0) + (next ? 1 : -1)),
      },
    }));
    let failed = false;
    try {
      const { error: err } = next
        ? await supabase
            .from("episode_saves")
            .upsert(
              { user_id: user.id, episode_id: item.episode_id },
              { onConflict: "user_id,episode_id", ignoreDuplicates: true }
            )
        : await supabase.from("episode_saves").delete().eq("user_id", user.id).eq("episode_id", item.episode_id);
      failed = !!err;
    } catch {
      failed = true;
    } finally {
      savingRef.current.delete(item.episode_id);
    }
    if (failed) {
      setEngagement((prev) => ({
        ...prev,
        [item.episode_id]: {
          ...prev[item.episode_id],
          saved: !next,
          saveCount: Math.max(0, (prev[item.episode_id]?.saveCount ?? 0) + (next ? -1 : 1)),
        },
      }));
    }
  }

  async function handleShare(item: PromoItem) {
    const url = typeof window !== "undefined" ? `${window.location.origin}${titlePath(item.slug)}` : "";
    const { data } = await supabase.rpc("record_episode_share", { p_episode_id: item.episode_id });
    setEngagement((prev) => ({
      ...prev,
      [item.episode_id]: {
        ...prev[item.episode_id],
        shareCount: data?.ok ? data.share_count : (prev[item.episode_id]?.shareCount ?? 0) + 1,
      },
    }));
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: item.title, url });
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

  async function openTray(item: PromoItem) {
    setShowTray(true);
    if (trayTitleId === item.title_id) return;
    setTrayTitleId(item.title_id);
    setTrayEpisodes([]);
    setTrayUnlockedIds(new Set());
    const [{ data: eps }, { data: t }, { data: settings }] = await Promise.all([
      supabase
        .from("episodes")
        .select("id, episode_number, name, unlock_cost_coins")
        .eq("title_id", item.title_id)
        .eq("status", "published")
        .gt("episode_number", 0)
        .order("episode_number", { ascending: true }),
      supabase.from("titles").select("free_episode_count").eq("id", item.title_id).single(),
      supabase.from("platform_settings").select("default_free_episodes, default_episode_unlock_coins").single(),
    ]);
    setTrayEpisodes((eps as TrayEpisode[]) ?? []);
    setTrayFreeCount(t?.free_episode_count ?? settings?.default_free_episodes ?? 4);
    setTrayDefaultCost(settings?.default_episode_unlock_coins ?? 30);
    const ids = (eps ?? []).map((e) => e.id);
    if (user && ids.length) {
      const { data: unlocks } = await supabase
        .from("episode_unlocks")
        .select("episode_id")
        .eq("user_id", user.id)
        .in("episode_id", ids);
      setTrayUnlockedIds(new Set((unlocks ?? []).map((u) => u.episode_id)));
    }
  }

  // Back button closes the full-movie layer instead of leaving For You.
  useEffect(() => {
    if (!fullEpisodeId) return;
    const marker = `full-${Date.now()}`;
    window.history.pushState({ ...(window.history.state ?? {}), __full: marker }, "", window.location.href);
    const onPop = () => {
      if (window.history.state?.__full !== marker) setFullEpisodeId(null);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by the on-screen back button (not the system Back): drop our entry.
      if (window.history.state?.__full === marker) window.history.back();
    };
  }, [fullEpisodeId]);

  async function openFullMovie(item: PromoItem) {
    const { data } = await supabase
      .from("episodes")
      .select("id")
      .eq("title_id", item.title_id)
      .eq("status", "published")
      .gt("episode_number", 0)
      .order("episode_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) setFullEpisodeId(data.id);
  }

  useFeedKeyboard(containerRef, !fullEpisodeId && !showSearch);

  const header = (
    <ForYouHeader
      tab={tab}
      onTabChange={changeTab}
      category={category}
      onCategoryChange={setCategory}
      onSearch={() => setShowSearch(true)}
    />
  );

  if (!items) {
    return (
      <div className="relative mx-auto h-dvh w-full overflow-hidden bg-black desk:max-w-[calc(100dvh*9/16)]">
        {header}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      </div>
    );
  }

  const active = items.find((i) => i.episode_id === activeId) ?? items[0];

  return (
    <div className="relative h-dvh w-full bg-black">
      <FeedNavArrows containerRef={containerRef} />
      <div className="relative mx-auto h-full w-full overflow-hidden bg-black desk:max-w-[calc(100dvh*9/16)]">
      {header}
      <ForYouSearch open={showSearch} onClose={() => setShowSearch(false)} onSelect={openSearchResult} />
      <div ref={containerRef} className="no-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-auto">
        {items.map((item) => {
          // The promo unmounts while the full movie is up, so only one video plays.
          const isActive = item.episode_id === activeId && !fullEpisodeId && !showSearch;
          const eng = engagement[item.episode_id];
          const epLabel = item.total_episodes > 0 ? `EP.${Math.max(item.episode_number, 1)}/EP.${item.total_episodes}` : null;

          return (
            <div
              key={item.episode_id}
              ref={(el) => {
                if (el) slideRefs.current.set(item.episode_id, el);
                else slideRefs.current.delete(item.episode_id);
              }}
              data-episode-id={item.episode_id}
              className="relative h-full w-full snap-start"
            >
              {isActive ? (
                <VideoPlayer
                  src={videoUrls[item.episode_id]}
                  autoPlay
                  posterUrl={item.thumbnail_url ?? item.poster_url ?? undefined}
                  hideWatermark
                  onRequestFreshSrc={() => refreshVideoUrl(item.episode_id)}
                  storyboardUrl={item.video_url ? storyboardPublicUrl(supabase, item.video_url) : null}
                  onTimeUpdate={(t) => reportProgress(item, t)}
                  onEnded={() => {
                    reportProgress(item, item.duration_seconds ?? lastPlayheadRef.current ?? 0, true);
                    goToNext(item);
                  }}
                  bottomContent={
                    <div className="flex flex-col gap-2">
                      {tab === "trending" && item.feed_rank ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-pink to-crimson px-2.5 py-1 text-[11px] font-bold text-white">
                          <Flame size={12} className="fill-white" />
                          #{item.feed_rank} Trending
                          {(item.recent_views ?? 0) > 0 && (
                            <span className="font-medium text-white/85">
                              · {formatCount(item.recent_views ?? 0)} this week
                            </span>
                          )}
                        </span>
                      ) : item.is_new ? (
                        <span className="w-fit rounded-[4px] bg-pink px-2 py-[3px] text-[10px] font-extrabold uppercase leading-none tracking-[0.1em] text-white">
                          {t("foryou.badgeNew")}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        data-tap
                        onClick={() => setShowDetails(true)}
                        className="flex max-w-[78%] items-center gap-1 text-left"
                      >
                        <span className="truncate font-display text-[17px] font-semibold text-white [text-shadow:0_1px_4px_rgb(0_0_0_/_0.6)]">
                          {item.title}
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-white/80" />
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(item.tags ?? []).slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90"
                          >
                            {t}
                          </span>
                        ))}
                        {epLabel && <span className="text-[12px] font-semibold text-white/80">{epLabel}</span>}
                      </div>

                      {item.synopsis && (
                        // "More" opens the same details sheet as the title —
                        // the synopsis never expands in place.
                        <button
                          type="button"
                          data-tap
                          onClick={() => setShowDetails(true)}
                          className="max-w-[78%] text-left text-[13px] leading-snug text-white/80 [text-shadow:0_1px_4px_rgb(0_0_0_/_0.6)]"
                        >
                          <span className="line-clamp-2">{item.synopsis}</span>{" "}
                          <span className="font-semibold text-white">{t("foryou.more")}</span>
                        </button>
                      )}
                    </div>
                  }
                  cta={
                    item.total_episodes > 1 ? (
                      <button
                        type="button"
                        data-tap
                        onClick={() => openFullMovie(item)}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-pink to-crimson text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(var(--pink)_/_0.65)] transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.98] active:brightness-95"
                      >
                        <Play size={16} className="fill-white" />
                        {t("foryou.watchFullMovie")}
                      </button>
                    ) : null
                  }
                  actionRail={
                    <ActionRail
                      saved={eng?.saved ?? false}
                      saveCount={eng?.saveCount ?? item.save_count}
                      onToggleSave={() => toggleSave(item)}
                      commentCount={eng?.commentCount ?? item.comment_count}
                      onOpenComments={() => setShowComments(true)}
                      shareCount={eng?.shareCount ?? item.share_count}
                      onShare={() => handleShare(item)}
                      onOpenEpisodes={() => openTray(item)}
                    />
                  }
                />
              ) : (
                // Not the active slide: a static frame only, so only one
                // video ever decodes/plays at a time.
                <div className="relative h-full w-full bg-black">
                  {(item.thumbnail_url ?? item.poster_url) && (
                    <Image src={(item.thumbnail_url ?? item.poster_url)!} alt="" fill className="object-cover opacity-70" />
                  )}
                </div>
              )}

            </div>
          );
        })}

        {!items.length && (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="text-[14px] text-white/70">{t(EMPTY_COPY_KEY[tab])}</p>
          </div>
        )}
      </div>

      {fullEpisodeId && (
        <div className="fixed inset-0 z-40 mx-auto max-w-md bg-black desk:left-[72px] desk:right-0 desk:max-w-none xl:left-60">
          <EpisodeFeed
            key={fullEpisodeId}
            initialEpisodeId={fullEpisodeId}
            onClose={() => setFullEpisodeId(null)}
          />
        </div>
      )}

      {shareToast && (
        <div className="absolute inset-x-0 bottom-28 z-30 flex justify-center">
          <span className="rounded-full bg-black/70 px-3.5 py-1.5 text-[12px] font-medium text-white">
            {t("foryou.linkCopied")}
          </span>
        </div>
      )}

      {active && (
        <>
          <CommentsSheet
            open={showComments}
            onClose={() => setShowComments(false)}
            episodeId={active.episode_id}
            count={engagement[active.episode_id]?.commentCount ?? active.comment_count}
            onCountChange={(n) =>
              setEngagement((prev) => ({
                ...prev,
                [active.episode_id]: { ...prev[active.episode_id], commentCount: n },
              }))
            }
          />

          <EpisodeTray
            open={showTray}
            onClose={() => setShowTray(false)}
            episodes={trayEpisodes}
            freeCount={trayFreeCount}
            unlockedIds={trayUnlockedIds}
            defaultCost={trayDefaultCost}
          />

          <TitleDetailsSheet
            open={showDetails}
            onClose={() => setShowDetails(false)}
            titleId={active.title_id}
            title={active.title}
            synopsis={active.synopsis}
            views={active.total_unique_views}
            contentRating={active.content_rating}
            posterUrl={active.poster_url}
            similarHref={(t) => `/for-you?title=${t.slug}`}
          />
        </>
      )}
      </div>
    </div>
  );
}
