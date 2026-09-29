"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RewardsState } from "@/lib/rewards";

const supabase = createClient();

// One RPC (get_rewards_state) backs the whole Rewards page. Every mutating
// action (check-in, claim, ad, redeem) is followed by a refetch rather than
// hand-rolled optimistic patches — the server recomputes streak/day-index/
// task status/watch-seconds together, and those are cheap, infrequent calls.
export function useRewardsState() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const { data, error: rpcError } = await supabase.rpc("get_rewards_state");
    if (id !== requestId.current) return;
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setState(data as RewardsState);
    setError(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { state, error, refresh, setError };
}
