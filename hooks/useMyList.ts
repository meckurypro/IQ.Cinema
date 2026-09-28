// hooks/useMyList.ts

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/categories";
import type { ListKind, MyListItem } from "@/lib/myList";

const supabase = createClient();

// Stale-while-revalidate: switching tabs paints the last result instantly,
// then reconciles with the server. Keyed by user so nothing leaks across
// sign-ins.
const cache = new Map<string, MyListItem[]>();

type MutationResult = PromiseLike<{ error: { message: string } | null }>;

export function useMyList(userId: string | undefined, kind: ListKind, category: Category | null) {
  const key = `${userId ?? "anon"}:${kind}:${category ?? "all"}`;
  const [items, setItems] = useState<MyListItem[] | null>(() => cache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const thisRequest = ++requestId.current;
    const { data, error: rpcError } = await supabase.rpc("get_my_list", {
      p_kind: kind,
      p_category: category,
    });
    // A newer fetch or an optimistic mutation superseded this one.
    if (thisRequest !== requestId.current) return;
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const rows = (data ?? []) as MyListItem[];
    cache.set(key, rows);
    setItems(rows);
    setError(null);
  }, [userId, kind, category, key]);

  useEffect(() => {
    setItems(cache.get(key) ?? null);
    setError(null);
    refresh();
  }, [key, refresh]);

  // Coming back from the player (or another tab) should show fresh progress.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Optimistic update with rollback. Other tabs' caches are dropped because a
  // follow/unfollow can change several of them at once.
  const mutate = useCallback(
    async (optimistic: (rows: MyListItem[]) => MyListItem[], run: () => MutationResult) => {
      const before = cache.get(key) ?? items ?? [];
      const next = optimistic(before);
      requestId.current += 1;
      cache.clear();
      cache.set(key, next);
      setItems(next);

      const { error: mutationError } = await run();
      if (mutationError) {
        cache.set(key, before);
        setItems(before);
        setError(mutationError.message);
        return false;
      }
      setError(null);
      return true;
    },
    [key, items]
  );

  return { items, error, refresh, mutate };
}
