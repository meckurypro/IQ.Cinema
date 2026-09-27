"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Wallet = {
  coin_balance: number;
  earnings_balance_naira: number;
  escrow_balance_naira: number;
};

const supabase = createClient();

export function useWallet(userId: string | undefined) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
    setWallet(data as Wallet);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Coin purchases and withdrawals are settled server-side by webhooks
  // (Paystack, the withdrawal processor) — without this, a purchase that
  // completes while the user is sitting on the wallet page would only show
  // up after their next manual refresh. This is what lets the balance
  // (and its count-up animation) react the moment it actually changes.
  useEffect(() => {
    if (!userId) return;

    // supabase.channel(topic) is a lookup, not a constructor: reusing a topic
    // hands back the already-subscribed channel, and calling .on() on that
    // throws. useWallet is used by both /wallet and /rewards, and route
    // transitions (or StrictMode's double-mount) can briefly overlap an old
    // subscription's teardown with a new one's setup — so every subscription
    // gets its own unique topic rather than a shared per-user name.
    const topic = `wallet-live-${userId}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        (payload) => {
          setWallet((prev) => ({ ...(prev ?? ({} as Wallet)), ...(payload.new as Partial<Wallet>) }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { wallet, loading, refresh };
}
