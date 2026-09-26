// components/wallet/CoinPackCard.tsx

"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type CoinPack = {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_naira: number;
};

export function CoinPackCard({
  pack,
  onBuy,
  loading,
}: {
  pack: CoinPack;
  onBuy: (id: string) => void;
  loading: boolean;
}) {
  const bonusPct = pack.bonus_coins > 0 ? Math.round((pack.bonus_coins / pack.coins) * 100) : 0;

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-soft">
          <Zap size={18} className="fill-gold text-gold" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-text">
            {pack.coins + pack.bonus_coins}
            <span className="ml-1 text-[12px] font-normal text-muted">coins</span>
          </p>
          {bonusPct > 0 && (
            <p className="text-[11px] font-medium text-gold">+{bonusPct}% bonus</p>
          )}
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => onBuy(pack.id)}
      >
        ₦{pack.price_naira.toLocaleString()}
      </Button>
    </div>
  );
}
