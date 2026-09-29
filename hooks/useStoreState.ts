"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StoreState } from "@/lib/store";

const supabase = createClient();

export function useStoreState() {
  const [state, setState] = useState<StoreState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("get_store");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setState(data as StoreState);
    setError(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, error, refresh };
}
