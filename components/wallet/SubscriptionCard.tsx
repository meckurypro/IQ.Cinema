// components/wallet/SubscriptionCard.tsx

"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

export type SubscriptionPlan = {
  id: string;
  name: string;
  interval: "weekly" | "monthly" | "annual";
  price_naira: number;
  includes_new_releases: boolean;
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
  return (
    <div
      className={clsx(
        "rounded-md border p-4",
        highlighted ? "border-pink bg-pink/10" : "border-border bg-surface"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-text">{plan.name}</p>
        {highlighted && (
          <span className="rounded-full bg-pink px-2 py-0.5 text-[10px] font-semibold text-white">
            Best value
          </span>
        )}
      </div>
      <p className="mt-1 text-[22px] font-semibold text-text">
        ₦{plan.price_naira.toLocaleString()}
        <span className="text-[13px] font-normal text-muted"> /{plan.interval}</span>
      </p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-text/85">
        <li className="flex items-center gap-1.5">
          <Check size={14} className="text-crimson" /> Unlimited back-catalog
        </li>
        <li className="flex items-center gap-1.5">
          <Check size={14} className="text-crimson" /> Ad-free
        </li>
        {plan.includes_new_releases && (
          <li className="flex items-center gap-1.5">
            <Check size={14} className="text-crimson" /> Day-one new releases
          </li>
        )}
      </ul>
      <Button
        className="mt-4 w-full"
        variant={highlighted ? "primary" : "secondary"}
        disabled={loading}
        onClick={() => onSubscribe(plan.id)}
      >
        Subscribe
      </Button>
    </div>
  );
}
