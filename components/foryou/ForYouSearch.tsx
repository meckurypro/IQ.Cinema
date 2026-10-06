// components/foryou/ForYouSearch.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Clock, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatEpisodeCount } from "@/lib/format";
import { useI18n } from "@/hooks/useI18n";

// Same row shape the feed uses (get_for_you_feed_v2 / search_for_you_promos).
export type SearchPromo = {
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
  is_new?: boolean;
  feed_rank?: number;
  recent_views?: number;
  match_source?: string;
};

const RECENT_KEY = "iqc:foryou:recent-searches";
const MAX_RECENT = 6;
const DEBOUNCE_MS = 150;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — recents are a nicety
  }
}

function tokenize(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/\s+/).filter(Boolean))).slice(0, 6);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Wraps every matched word in an accent-coloured <mark>, like the highlight in
// a chat app's message search.
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-bold text-pink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// Shows the part of the synopsis around the first match, not just its start,
// so a hit deep in the text is visible.
function snippetFor(synopsis: string | null, tokens: string[]): string {
  if (!synopsis) return "";
  const flat = synopsis.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let first = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  if (first < 0) return flat.slice(0, 140);
  const start = Math.max(0, first - 45);
  const end = Math.min(flat.length, start + 150);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

function ResultRow({
  item,
  tokens,
  onPick,
}: {
  item: SearchPromo;
  tokens: string[];
  onPick: (item: SearchPromo) => void;
}) {
  const { t } = useI18n();
  const art = item.poster_url ?? item.thumbnail_url;
  const snippet = snippetFor(item.synopsis, tokens);
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-white/10"
    >
      <span className="relative h-[84px] w-[60px] shrink-0 overflow-hidden rounded-md bg-white/10">
        {art && <Image src={art} alt="" fill sizes="60px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-white">
          <Highlight text={item.title} tokens={tokens} />
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-white/55">
          {[item.tags?.[0], item.total_episodes > 0 ? formatEpisodeCount(item.total_episodes, t) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {snippet && (
          <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-white/70">
            <Highlight text={snippet} tokens={tokens} />
          </span>
        )}
      </span>
    </button>
  );
}

export function ForYouSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: SearchPromo) => void;
}) {
  const { t } = useI18n();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPromo[]>([]);
  const [settledQuery, setSettledQuery] = useState(""); // the query `results` belong to
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<SearchPromo[]>([]);

  // Fresh state every time the overlay opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSettledQuery("");
    setFailed(false);
    setRecent(readRecent());
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  // "Trending now" suggestions for the empty state — the same ranking as the
  // Trending tab.
  useEffect(() => {
    if (!open || popular.length) return;
    supabase
      .rpc("get_for_you_feed_v2", { p_tab: "trending", p_limit: 6, p_offset: 0, p_category: null })
      .then(({ data }) => setPopular((data as SearchPromo[]) ?? []));
  }, [open, popular.length, supabase]);

  // Filter as you type: debounced, and a token guards against a slow response
  // for an older keystroke overwriting a newer one.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      tokenRef.current++;
      setResults([]);
      setSettledQuery("");
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    const token = ++tokenRef.current;
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_for_you_promos", {
        p_query: q,
        p_limit: 20,
        p_offset: 0,
      });
      if (token !== tokenRef.current) return;
      if (error) {
        console.error("search_for_you_promos failed", error.message);
        setFailed(true);
        setResults([]);
      } else {
        setFailed(false);
        setResults((data as SearchPromo[]) ?? []);
      }
      setSettledQuery(q);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, open, supabase]);

  const remember = useCallback((q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    const next = [clean, ...readRecent().filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
    writeRecent(next);
    setRecent(next);
  }, []);

  function pick(item: SearchPromo) {
    remember(query);
    onSelect(item);
  }

  if (!open) return null;

  const q = query.trim();
  const tokens = tokenize(settledQuery || q);
  const showResults = q.length > 0;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-black">
      <div
        className="flex items-center gap-2 border-b border-white/10 px-3 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("foryou.closeSearch")}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-3.5">
          <Search size={16} className="shrink-0 text-white/55" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                remember(query);
                inputRef.current?.blur();
              }
            }}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("foryou.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("foryou.clear")}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-black"
            >
              <X size={12} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto pb-10" onScroll={() => inputRef.current?.blur()}>
        {showResults ? (
          <>
            {!loading && settledQuery === q && !failed && results.length > 0 && (
              <p className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                {t(results.length === 1 ? "foryou.resultOne" : "foryou.resultMany", { n: results.length })}
              </p>
            )}
            {results.map((item) => (
              <ResultRow key={item.episode_id} item={item} tokens={tokens} onPick={pick} />
            ))}
            {!results.length && !loading && settledQuery === q && (
              <div className="px-8 pt-16 text-center">
                <p className="text-[15px] font-semibold text-white">
                  {failed ? t("foryou.searchUnavailable") : t("foryou.noPromosMatch", { q })}
                </p>
                <p className="mt-1.5 text-[13px] text-white/55">
                  {failed ? t("foryou.checkConnection") : t("foryou.tryDifferent")}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="pt-3">
                <div className="flex items-center justify-between px-4 pb-1">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-white/45">{t("foryou.recent")}</h3>
                  <button
                    type="button"
                    onClick={() => {
                      writeRecent([]);
                      setRecent([]);
                    }}
                    className="text-[12px] font-semibold text-white/60"
                  >
                    {t("foryou.clear")}
                  </button>
                </div>
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQuery(r)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-white/85 active:bg-white/10"
                  >
                    <Clock size={16} className="shrink-0 text-white/40" />
                    <span className="truncate">{r}</span>
                  </button>
                ))}
              </section>
            )}
            {popular.length > 0 && (
              <section className="pt-3">
                <h3 className="px-4 pb-1 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                  {t("foryou.trendingNow")}
                </h3>
                {popular.map((item) => (
                  <ResultRow key={item.episode_id} item={item} tokens={[]} onPick={pick} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
