// app/rewards/page.tsx

"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Zap, Gift, Flame, Users, Wallet, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { Skeleton } from "@/components/ui/Skeleton";
import clsx from "clsx";

export default function RewardsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { wallet, loading: walletLoading } = useWallet(user?.id);

  const isCreator = profile?.role === "creator" || profile?.creator_status === "partner";

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <h1 className="font-display text-2xl font-semibold text-text">Rewards</h1>
      <p className="mt-2 text-sm text-muted">
        Track your coin balance, earn more, and see what's waiting for you.
      </p>

      {/* Balance summary, links into the wallet for buying/managing coins */}
      <Link
        href="/wallet"
        className="mt-5 flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors active:bg-surface-raised"
      >
        <div>
          <p className="text-[12px] text-muted">Coin balance</p>
          {walletLoading || authLoading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 flex items-center gap-1.5 font-display text-2xl font-semibold text-text">
              <Zap size={20} className="fill-gold text-gold" />
              {wallet?.coin_balance?.toLocaleString() ?? 0}
            </p>
          )}
        </div>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-pink">
          <Wallet size={16} />
          Go to wallet
          <ChevronRight size={16} />
        </span>
      </Link>

      {/* Ways to earn more coins */}
      <section className="mt-7">
        <h2 className="font-display mb-2.5 text-[17px] font-semibold text-text">Ways to earn</h2>
        <div className="space-y-2">
          <RewardRow
            tone="crimson"
            icon={<Flame size={18} className="text-crimson" />}
            title="Daily streak"
            description="Open IQ Cinema every day to build your streak and unlock bonus coins."
          />
          <RewardRow
            tone="pink"
            icon={<Gift size={18} className="text-pink" />}
            title="Watch milestones"
            description="Finish episodes and titles to unlock milestone rewards as you go."
          />
          <RewardRow
            tone="pink"
            icon={<Users size={18} className="text-pink" />}
            title="Invite friends"
            description="Share IQ Cinema with friends — you'll both get a coin bonus when they join."
          />
        </div>
      </section>

      {/* Creator payouts, only shown to approved creators/partners */}
      {!authLoading && isCreator && (
        <section className="mt-7">
          <h2 className="font-display mb-2.5 text-[17px] font-semibold text-text">
            Creator earnings
          </h2>
          <Link
            href="/creator/withdraw"
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors active:bg-surface-raised"
          >
            <div>
              <p className="text-[12px] text-muted">Available to withdraw</p>
              <p className="mt-1 font-display text-xl font-semibold text-text">
                ₦{wallet?.earnings_balance_naira?.toLocaleString() ?? 0}
              </p>
            </div>
            <ChevronRight size={18} className="text-muted" />
          </Link>
        </section>
      )}

      {/* Direct CTA to buy coins / subscribe */}
      <Link
        href="/wallet"
        className={clsx(
          "mt-8 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-pink to-crimson px-4 py-3",
          "font-display text-[15px] font-semibold text-white transition-opacity active:opacity-80"
        )}
      >
        <Zap size={18} className="fill-current" />
        Buy coins or subscribe
      </Link>
    </main>
  );
}

function RewardRow({
  icon,
  title,
  description,
  tone = "gold",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "gold" | "pink" | "crimson";
}) {
  const toneBg = {
    gold: "bg-gold-soft",
    pink: "bg-pink/10",
    crimson: "bg-crimson-soft",
  }[tone];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5">
      <div className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", toneBg)}>
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
      </div>
    </div>
  );
}
