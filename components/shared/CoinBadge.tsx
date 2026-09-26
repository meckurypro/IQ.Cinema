// components/shared/CoinBadge.tsx

"use client";

import { Zap } from "lucide-react";
import clsx from "clsx";

export function CoinBadge({ amount, pop = false }: { amount: number; pop?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-sm font-semibold text-text",
        pop && "coin-pop"
      )}
    >
      <Zap size={13} className="fill-gold text-gold" />
      {amount.toLocaleString()}
    </span>
  );
}
