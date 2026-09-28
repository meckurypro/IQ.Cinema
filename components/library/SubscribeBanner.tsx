// components/library/SubscribeBanner.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";

const supabase = createClient();
const known = new Map<string, boolean>();

// Promo strip that only shows for people without an active subscription.
export function SubscribeBanner() {
  const { user } = useAuth();
  const userId = user?.id;
  const [subscribed, setSubscribed] = useState<boolean | null>(() =>
    userId ? known.get(userId) ?? null : null
  );

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId) // RLS also lets admins read everyone's rows
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .limit(1)
      .then(({ data, error }) => {
        if (ignore || error) return;
        const active = (data ?? []).length > 0;
        known.set(userId, active);
        setSubscribed(active);
      });
    return () => {
      ignore = true;
    };
  }, [userId]);

  if (!userId) return null;
  if (subscribed === null) return <Skeleton className="h-[52px] w-full rounded-lg" />;
  if (subscribed) return null;

  return (
    <Link
      href="/wallet"
      className="flex h-[52px] items-center gap-3 rounded-lg bg-gradient-to-r from-[#f8e2ae] to-[#f0b95f] px-3.5 text-[#3b2a0b] shadow-card transition-transform active:scale-[0.99]"
    >
      <Crown size={22} className="shrink-0 fill-[#3b2a0b]/15" strokeWidth={1.75} />
      <span className="flex-1 text-[16px] font-semibold tracking-tight">
        Unlimited access to all series
      </span>
      <span aria-hidden className="h-2 w-2 rounded-full bg-pink" />
      <ChevronRight size={20} />
    </Link>
  );
}
