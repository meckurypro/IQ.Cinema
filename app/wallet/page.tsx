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
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import clsx from "clsx";
import { translateRuntimeError } from "@/lib/i18n/runtimeErrors";

const TIP_KEYS: MessageKey[] = [
  "wallet.tip1",
  "wallet.tip2",
  "wallet.tip3",
  "wallet.tip4",
  "wallet.tip5",
  "wallet.tip6",
];

export default function WalletPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
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
      setError(t("wallet.signInToContinue"));
      return;
    }
    setError(null);
    setBuyingId(id);
    try {
      const { authorization_url } = await initializePaystackPurchase(type, id);
      redirectToPaystackCheckout(authorization_url);
    } catch (e) {
      setError(translateRuntimeError((e as Error).message, t));
      setBuyingId(null);
    }
  }

  const loading = !state;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label={t("common.back")} className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">{t("wallet.title")}</h1>
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
          <span className="text-[12px] text-muted">{t("wallet.coins")}</span>
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
          <span className="text-[12px] text-muted">{t("wallet.rewardCoins")}</span>
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
            👑 {t("wallet.planActive", { plan: state.membership.plan_name ?? "" })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {t(state.membership.auto_renew ? "wallet.renewsOn" : "wallet.endsOn", {
              date: new Date(state.membership.ends_at!).toLocaleDateString(lang),
            })}
          </p>
        </div>
      )}

      <section className="mt-6">
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("wallet.coins")}</h2>
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
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("wallet.subscription")}</h2>
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
        <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("wallet.tips")}</h2>
        <ol className="space-y-2 text-[12.5px] leading-relaxed text-muted">
          {TIP_KEYS.map((key, i) => (
            <li key={key}>
              {i + 1}. {t(key)}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
