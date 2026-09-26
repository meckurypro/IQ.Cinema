// app/wallet/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Zap, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { CoinPackCard, type CoinPack } from "@/components/wallet/CoinPackCard";
import { SubscriptionCard, type SubscriptionPlan } from "@/components/wallet/SubscriptionCard";
import { initializePaystackPurchase, redirectToPaystackCheckout } from "@/lib/paystack";
import { Skeleton } from "@/components/ui/Skeleton";

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("coin_packs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPacks((data as CoinPack[]) ?? []));

    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPlans((data as SubscriptionPlan[]) ?? []));
  }, []);

  async function handleBuy(type: "coins" | "subscription", id: string) {
    if (!user) {
      setError("Sign in to continue.");
      return;
    }
    setError(null);
    setBuyingId(id);
    try {
      const { authorization_url } = await initializePaystackPurchase(type, id);
      redirectToPaystackCheckout(authorization_url);
    } catch (e) {
      setError((e as Error).message);
      setBuyingId(null);
    }
  }

  return (
    <div className="fade-in px-4 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Wallet</h1>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-4 text-center">
        <p className="text-[12px] text-muted">Coin balance</p>
        {walletLoading ? (
          <Skeleton className="mx-auto mt-2 h-8 w-24" />
        ) : (
          <p className="mt-1 flex items-center justify-center gap-1.5 font-display text-3xl font-semibold text-text">
            <Zap size={22} className="fill-gold text-gold" />
            {wallet?.coin_balance?.toLocaleString() ?? 0}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">
          {error}
        </p>
      )}

      <section className="mt-6">
        <h2 className="font-display mb-2.5 text-[17px] font-semibold text-text">Buy coins</h2>
        <div className="space-y-2">
          {packs.map((pack) => (
            <CoinPackCard
              key={pack.id}
              pack={pack}
              loading={buyingId === pack.id}
              onBuy={(id) => handleBuy("coins", id)}
            />
          ))}
          {!packs.length && (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          )}
        </div>
      </section>

      <section className="mt-7 pb-8">
        <h2 className="font-display mb-2.5 text-[17px] font-semibold text-text">Subscribe</h2>
        <div className="space-y-3">
          {plans.map((plan) => (
            <SubscriptionCard
              key={plan.id}
              plan={plan}
              highlighted={plan.interval === "monthly"}
              loading={buyingId === plan.id}
              onSubscribe={(id) => handleBuy("subscription", id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
