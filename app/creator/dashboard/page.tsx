// app/creator/dashboard/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type Eligibility = {
  eligible: boolean;
  unique_views: number;
  unique_views_required: number;
  watch_hours: number;
  watch_hours_required: number;
  episode_count: number;
  episode_count_required: number;
  account_age_days: number;
  account_age_required: number;
  active_strikes: number;
};

function ProgressRow({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(target, 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="text-text">
          {value.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-pink transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const { user, profile } = useAuth();
  const { wallet } = useWallet(user?.id);
  const supabase = createClient();
  const [titles, setTitles] = useState<any[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [isPartner, setIsPartner] = useState(false);
  const [applyingPartner, setApplyingPartner] = useState(false);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("titles")
      .select("id, slug, title, status, total_unique_views")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTitles(data ?? []));

    supabase
      .from("creator_partner_state")
      .select("is_partner")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => setIsPartner(!!data?.is_partner));

    supabase
      .rpc("check_partner_eligibility", { p_user_id: user.id })
      .then(({ data }) => setEligibility(data as Eligibility));
  }, [user, supabase]);

  async function applyForPartner() {
    if (!user) return;
    setApplyingPartner(true);
    await supabase.from("partner_applications").insert({
      user_id: user.id,
      snapshot: eligibility ?? {},
    });
    setApplyingPartner(false);
  }

  if (!profile) return null;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">Creator dashboard</h1>
        <Link href="/creator/upload">
          <Button size="sm">
            <Plus size={15} /> Upload
          </Button>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-surface p-3.5">
          <p className="text-[11px] text-muted">Available balance</p>
          <p className="mt-1 text-[19px] font-semibold text-text">
            ₦{(wallet?.earnings_balance_naira ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3.5">
          <p className="text-[11px] text-muted">In escrow</p>
          <p className="mt-1 text-[19px] font-semibold text-text">
            ₦{(wallet?.escrow_balance_naira ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {isPartner ? (
        <Link href="/creator/withdraw">
          <Button variant="primary" className="mt-3 w-full">
            Request withdrawal
          </Button>
        </Link>
      ) : (
        <div className="mt-5 rounded-md border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold text-text">Partner Program progress</p>
          <p className="mt-1 text-[12px] text-muted">
            Hit every milestone below to apply. Earnings stay in escrow until you're approved.
          </p>
          {eligibility ? (
            <div className="mt-3 space-y-2.5">
              <ProgressRow
                label="Unique views"
                value={eligibility.unique_views}
                target={eligibility.unique_views_required}
              />
              <ProgressRow
                label="Watch hours"
                value={eligibility.watch_hours}
                target={eligibility.watch_hours_required}
              />
              <ProgressRow
                label="Episodes published"
                value={eligibility.episode_count}
                target={eligibility.episode_count_required}
              />
              <ProgressRow
                label="Account age (days)"
                value={eligibility.account_age_days}
                target={eligibility.account_age_required}
              />
              <Button
                className="mt-2 w-full"
                disabled={!eligibility.eligible || applyingPartner}
                onClick={applyForPartner}
              >
                {eligibility.eligible ? "Apply for Partner Program" : "Not yet eligible"}
              </Button>
            </div>
          ) : (
            <Skeleton className="mt-3 h-24 w-full" />
          )}
        </div>
      )}

      <h2 className="font-display mt-7 mb-2.5 text-[17px] font-semibold text-text">Your titles</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {titles.map((t) => (
          <li key={t.id}>
            <Link href={`/title/${t.slug}`} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-text">{t.title}</p>
                <p className="mt-0.5 text-[12px] capitalize text-muted">{t.status}</p>
              </div>
              <span className="flex items-center gap-1 text-[12px] text-muted">
                <Zap size={11} className="fill-gold text-gold" />
                {t.total_unique_views}
              </span>
            </Link>
          </li>
        ))}
        {!titles.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">No titles uploaded yet.</li>
        )}
      </ul>
    </div>
  );
}
