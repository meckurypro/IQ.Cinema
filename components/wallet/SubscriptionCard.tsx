// components/wallet/SubscriptionCard.tsx

"use client";

import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { SubscriptionPlan } from "@/lib/store";

const INTERVAL_LABEL: Record<SubscriptionPlan["interval"], string> = {
  weekly: "week",
  monthly: "month",
  annual: "year",
};

export function SubscriptionCard({
  plan,
  highlighted,
  onSubscribe,
  loading,
}: {
  plan: SubscriptionPlan;
  highlighted?: boolean;
  onSubscribe: (id: string) => void;
  loading: boolean;
}) {
  const showIntro = plan.intro_eligible && plan.intro_price_naira != null;
  const price = showIntro ? plan.intro_price_naira! : plan.price_naira;

  return (
    <div
      className={clsx(
        "relative rounded-lg border p-4",
        highlighted ? "border-gold bg-gradient-to-b from-gold-soft to-surface" : "border-border bg-surface"
      )}
    >
      {plan.badge && (
        <span className="absolute right-3 top-0 -translate-y-1/2 rounded-full bg-crimson px-2.5 py-0.5 text-[10px] font-bold text-white">
          {plan.badge}
        </span>
      )}
      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
        👑 {plan.name}
      </p>
      {plan.description && <p className="mt-1 text-[13px] text-muted">{plan.description}</p>}

      <p className="mt-2.5 flex items-baseline gap-2">
        <span className="font-display text-[22px] font-semibold text-gold">
          ₦{price.toLocaleString()}
        </span>
        {showIntro && (
          <span className="text-[13px] font-medium text-muted line-through">
            ₦{plan.price_naira.toLocaleString()}
          </span>
        )}
      </p>
      {showIntro && (
        <p className="text-[11.5px] text-muted">
          ₦{plan.intro_price_naira!.toLocaleString()} for the first {plan.interval}, then ₦
          {plan.price_naira.toLocaleString()}/{INTERVAL_LABEL[plan.interval]}
        </p>
      )}
      <p className="text-[11.5px] text-muted">Auto renew · Cancel anytime</p>

      {plan.ai_generations != null && plan.ai_generations > 0 && (
        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-surface-raised px-3 py-2 text-[12.5px] text-text">
          <Sparkles size={14} className="text-pink" />
          {plan.ai_generations} AI generations/{INTERVAL_LABEL[plan.interval]}
        </div>
      )}

      <Button
        className="mt-3.5 w-full"
        variant={highlighted ? "gold" : "secondary"}
        disabled={loading}
        onClick={() => onSubscribe(plan.id)}
      >
        {loading ? "Starting…" : "Subscribe"}
      </Button>
    </div>
  );
}
