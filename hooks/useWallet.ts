"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Wallet = {
  coin_balance: number;
  earnings_balance_naira: number;
  escrow_balance_naira: number;
};

export function useWallet(userId: string | undefined) {
  const supabase = createClient();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
    setWallet(data as Wallet);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { wallet, loading, refresh };
}
