// app/points/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gem, Gift, Lock } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/hooks/useI18n";
import { translateRuntimeError } from "@/lib/i18n/runtimeErrors";

const supabase = createClient();

type PointsItem = {
  id: string;
  kind: "membership_days" | "reward_coins" | "coupon";
  name: string;
  description: string | null;
  cost_points: number;
  membership_days: number | null;
  reward_coins: number | null;
};

type PointsState = {
  signed_in: boolean;
  vip: boolean;
  points: number;
  box: { opened_today: boolean; points_today: number | null; vip_only: boolean; min: number; max: number };
  items: PointsItem[];
  redemptions: { id: string; item_name: string; cost_points: number; created_at: string }[];
};

export default function PointsPage() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PointsState | null>(null);
  const [cracking, setCracking] = useState(false);
  const [crackResult, setCrackResult] = useState<number | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("get_points_state");
    if (rpcError) {
      setError(translateRuntimeError(rpcError.message, t));
      return;
    }
    setState(data as PointsState);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { display: pointsDisplay, changed: pointsChanged } = useAnimatedNumber(state?.points);

  async function crack() {
    setCracking(true);
    setError(null);
    const { data } = await supabase.rpc("crack_daily_box");
    setCracking(false);
    if (!data?.ok) {
      setError(
        data?.error === "vip_required"
          ? t("points.vipRequiredError")
          : t("points.alreadyOpened")
      );
    } else {
      setCrackResult(data.points);
    }
    refresh();
  }

  async function redeem(item: PointsItem) {
    setRedeemingId(item.id);
    setError(null);
    const { data } = await supabase.rpc("redeem_points_item", { p_item_id: item.id });
    setRedeemingId(null);
    if (!data?.ok) {
      setError(
        data?.error === "insufficient_points"
          ? t("points.notEnough")
          : data?.error === "vip_required"
          ? t("points.needMembership")
          : t("points.redeemFailed")
      );
    }
    refresh();
  }

  const loading = authLoading || !state;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/rewards" aria-label={t("common.back")} className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">{t("points.title")}</h1>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 w-fit">
        <Gem size={15} className="text-pink" />
        {loading ? (
          <Skeleton className="h-4 w-10" />
        ) : (
          <span
            className={clsx(
              "font-display text-[14px] font-semibold tabular-nums text-text",
              pointsChanged && "coin-pop"
            )}
          >
            {pointsDisplay.toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">{error}</p>
      )}

      {/* Daily box */}
      <div className="mt-6 flex flex-col items-center rounded-lg border border-border bg-surface px-4 py-7 text-center">
        <div
          className={clsx(
            "flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-gold-soft to-gold/30 text-4xl",
            crackResult !== null && "coin-pop"
          )}
        >
          {crackResult !== null ? "🎉" : "🎁"}
        </div>
        <p className="font-display mt-3 text-[16px] font-semibold text-text">
          {crackResult !== null ? t("points.youWon", { n: crackResult }) : t("points.crackTheBox")}
        </p>
        {crackResult === null && !loading && (
          <p className="mt-1 text-[12.5px] text-gold">
            {t("points.winUpTo", { n: state.box.max })}
          </p>
        )}
        {!loading && state.box.vip_only && !state.vip ? (
          <Link href="/wallet" className="mt-4 w-full max-w-[220px]">
            <Button variant="gold" className="w-full">
              <Lock size={14} /> {t("points.vipRequired")}
            </Button>
          </Link>
        ) : (
          <Button
            variant="gold"
            className="mt-4 w-full max-w-[220px]"
            disabled={cracking || (state?.box.opened_today ?? true) || loading}
            onClick={crack}
          >
            {loading
              ? "…"
              : state.box.opened_today
              ? t("points.openedToday", { n: state.box.points_today ?? 0 })
              : cracking
              ? t("points.opening")
              : t("points.unlockNow")}
          </Button>
        )}
      </div>

      {/* Redemption */}
      <section className="mt-7">
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("points.redemption")}</h2>
        <div className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : (
            state.items.map((item) => {
              const canAfford = state.points >= item.cost_points;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink/10 text-pink">
                    <Gift size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-text">{item.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-pink">
                      <Gem size={11} />
                      {item.cost_points.toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canAfford || redeemingId === item.id}
                    onClick={() => redeem(item)}
                  >
                    {redeemingId === item.id ? "…" : t("points.redeem")}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {!loading && state.redemptions.length > 0 && (
        <section className="mt-7 pb-4">
          <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("points.recentRedemptions")}</h2>
          <div className="space-y-1.5">
            {state.redemptions.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[13px]">
                <span className="text-text">{r.item_name}</span>
                <span className="text-muted">-{t("points.pts", { n: r.cost_points.toLocaleString() })}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
