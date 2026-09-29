// app/wallet/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useStoreState } from "@/hooks/useStoreState";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { CoinPackCard } from "@/components/wallet/CoinPackCard";
import { SubscriptionCard } from "@/components/wallet/SubscriptionCard";
import { initializePaystackPurchase, redirectToPaystackCheckout } from "@/lib/paystack";
import { Skeleton } from "@/components/ui/Skeleton";
import clsx from "clsx";

const TIPS = [
  "Content Selection: You can choose to unlock free or paid content on IQ Cinema.",
  "Reward Coins: Earn Reward Coins through tasks and top-up bonuses. These can be used like regular Coins to unlock episodes.",
  "Coins will be used first when unlocking an episode. If the amount is insufficient, Reward Coins will automatically be used.",
  "Privilege: Enjoy unlimited access to all series on IQ Cinema during your subscription period.",
  "Activation: Subscriptions are activated immediately after a successful payment.",
  "Auto-Renewal: Subscriptions auto-renew at the original price unless canceled beforehand.",
];

export default function WalletPage() {
  const { user } = useAuth();
  const { state, error: stateError, refresh } = useStoreState();
  const { display: coinsDisplay, changed: coinsChanged } = useAnimatedNumber(state?.balances.coins);
  const { display: rewardDisplay, changed: rewardChanged } = useAnimatedNumber(
    state?.balances.reward_coins
  );
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A completed Paystack checkout lands the user back here (browser back /
  // tab refocus) — refetch so the new balance or membership shows without
  // a manual pull-to-refresh.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

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

  const loading = !state;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Store</h1>
      </div>

      <div className="mt-4 flex items-stretch rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-1 flex-col items-center gap-1">
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span
              className={clsx(
                "font-display text-[22px] font-semibold tabular-nums text-text",
                coinsChanged && "coin-pop"
              )}
            >
              {coinsDisplay.toLocaleString()}
            </span>
          )}
          <span className="text-[12px] text-muted">Coins</span>
        </div>
        <div className="w-px bg-border" />
        <div className="flex flex-1 flex-col items-center gap-1">
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span
              className={clsx(
                "font-display text-[22px] font-semibold tabular-nums text-text",
                rewardChanged && "coin-pop"
              )}
            >
              {rewardDisplay.toLocaleString()}
            </span>
          )}
          <span className="text-[12px] text-muted">Reward Coins</span>
        </div>
      </div>

      {(error || stateError) && (
        <p className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">
          {error ?? stateError}
        </p>
      )}

      {!loading && state.membership.active && (
        <div className="mt-4 rounded-lg border border-gold bg-gold-soft px-4 py-3">
          <p className="text-[13px] font-semibold text-text">
            👑 {state.membership.plan_name} is active
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {state.membership.auto_renew ? "Renews" : "Ends"} on{" "}
            {new Date(state.membership.ends_at!).toLocaleDateString()}
          </p>
        </div>
      )}

      <section className="mt-6">
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">Coins</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {loading ? (
            <>
              <Skeleton className="h-[76px] w-full" />
              <Skeleton className="h-[76px] w-full" />
              <Skeleton className="h-[76px] w-full" />
              <Skeleton className="h-[76px] w-full" />
            </>
          ) : (
            state.packs.map((pack, i) => (
              <CoinPackCard
                key={pack.id}
                pack={pack}
                highlighted={i === 1}
                loading={buyingId === pack.id}
                onBuy={(id) => handleBuy("coins", id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-7 pb-4">
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">Subscription</h2>
        <div className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : (
            state.plans.map((plan) => (
              <SubscriptionCard
                key={plan.id}
                plan={plan}
                highlighted={plan.interval === "monthly"}
                loading={buyingId === plan.id}
                onSubscribe={(id) => handleBuy("subscription", id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="mt-2 pb-6">
        <h2 className="font-display mb-2 text-[14px] font-semibold text-text">Tips</h2>
        <ol className="space-y-2 text-[12.5px] leading-relaxed text-muted">
          {TIPS.map((tip, i) => (
            <li key={i}>
              {i + 1}. {tip}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
