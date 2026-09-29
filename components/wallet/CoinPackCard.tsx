// components/wallet/CoinPackCard.tsx

"use client";

import { Zap } from "lucide-react";
import clsx from "clsx";
import type { CoinPack } from "@/lib/store";

export function CoinPackCard({
  pack,
  highlighted,
  onBuy,
  loading,
}: {
  pack: CoinPack;
  highlighted?: boolean;
  onBuy: (id: string) => void;
  loading: boolean;
}) {
  const bonusPct = pack.bonus_coins > 0 ? Math.round((pack.bonus_coins / pack.coins) * 100) : 0;

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => onBuy(pack.id)}
      className={clsx(
        "relative flex w-full flex-col items-start overflow-hidden rounded-lg border px-3.5 py-3 text-left transition-transform active:scale-[0.98] disabled:opacity-60",
        highlighted ? "border-gold bg-gold-soft" : "border-border bg-surface"
      )}
    >
      {bonusPct > 0 && (
        <span className="absolute right-0 top-0 flex items-center gap-0.5 rounded-bl-md bg-gradient-to-r from-pink to-crimson px-2 py-0.5 text-[10px] font-bold text-white">
          {bonusPct}% <Zap size={9} className="fill-white" />
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Zap size={16} className="fill-gold text-gold" />
        <span className="font-display text-[17px] font-semibold text-text">{pack.coins}</span>
        {pack.bonus_coins > 0 && (
          <span className="text-[13px] font-medium text-gold">+{pack.bonus_coins}</span>
        )}
      </span>
      <span className="mt-1.5 text-[13px] font-semibold text-text">
        ₦{pack.price_naira.toLocaleString()}
      </span>
    </button>
  );
}
