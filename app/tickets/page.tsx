// app/tickets/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ticket } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";

type Coupon = {
  id: string;
  name: string;
  discount_percent: number;
  expires_at: string;
  used_at: string | null;
};

const supabase = createClient();

export default function TicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_coupons")
      .select("id, name, discount_percent, expires_at, used_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setCoupons((data as Coupon[]) ?? []));
  }, [user]);

  const now = Date.now();
  const loading = authLoading || !coupons;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">My Ticket Collection</h1>
      </div>

      {loading ? (
        <div className="mt-5 space-y-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <Ticket size={28} className="text-muted" />
          <p className="text-[14px] text-muted">No coupons yet — earn them through rewards and offers.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {coupons.map((c) => {
            const expired = new Date(c.expires_at).getTime() < now;
            const spent = Boolean(c.used_at);
            const inactive = expired || spent;
            return (
              <div
                key={c.id}
                className={clsx(
                  "flex items-center gap-3 rounded-lg border px-4 py-3.5",
                  inactive ? "border-border bg-surface opacity-50" : "border-pink/40 bg-pink/5"
                )}
              >
                <div
                  className={clsx(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    inactive ? "bg-surface-raised text-muted" : "bg-pink/15 text-pink"
                  )}
                >
                  <Ticket size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-text">{c.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {c.discount_percent}% off one episode unlock ·{" "}
                    {spent ? "used" : expired ? "expired" : `expires ${new Date(c.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
