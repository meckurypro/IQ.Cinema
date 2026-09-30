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
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";

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

// check_partner_eligibility is a Postgres RPC declared as RETURNS TABLE(...),
// so supabase-js hands back an array of rows (length 0 or 1) even though
// there's conceptually only ever one row per user. Casting that array
// straight to `Eligibility` was the bug: `eligibility` ended up being a
// truthy array with no `.unique_views`/`.eligible` fields, which passed the
// `eligibility ? ... : <Skeleton />` check and rendered ProgressRow with
// `value={undefined}`, and `undefined.toLocaleString()` threw. This helper
// unwraps the row regardless of whether the RPC (or a future change to it)
// returns an array or a single object.
function unwrapEligibility(data: unknown): Eligibility | null {
  if (Array.isArray(data)) return (data[0] as Eligibility) ?? null;
  return (data as Eligibility) ?? null;
}

const TITLE_STATUS_KEY: Record<string, MessageKey> = {
  draft: "creator.status.draft",
  in_review: "creator.status.in_review",
  published: "creator.status.published",
  coming_soon: "creator.status.coming_soon",
  suspended: "creator.status.suspended",
  rejected: "creator.status.rejected",
  withdrawn: "creator.status.withdrawn",
};

function ProgressRow({ label, value, target }: { label: string; value: number; target: number }) {
  const { lang } = useI18n();
  const safeValue = value ?? 0;
  const safeTarget = target ?? 0;
  const pct = Math.min(100, Math.round((safeValue / Math.max(safeTarget, 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="text-text">
          {safeValue.toLocaleString(lang)} / {safeTarget.toLocaleString(lang)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-pink transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const { t, lang } = useI18n();
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
      .select("id, slug, title, status, genre, total_unique_views")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Failed to load titles:", error.message);
        setTitles(data ?? []);
      });

    supabase
      .from("creator_partner_state")
      .select("is_partner")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        // PGRST116 = no row found, expected for creators who aren't
        // partner-tracked yet; anything else is worth logging.
        if (error && error.code !== "PGRST116") {
          console.error("Failed to load partner state:", error.message);
        }
        setIsPartner(!!data?.is_partner);
      });

    supabase
      .rpc("check_partner_eligibility", { p_user_id: user.id })
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load partner eligibility:", error.message);
          setEligibility(null);
          return;
        }
        setEligibility(unwrapEligibility(data));
      });
  }, [user, supabase]);

  async function applyForPartner() {
    if (!user) return;
    setApplyingPartner(true);
    const { error } = await supabase.from("partner_applications").insert({
      user_id: user.id,
      snapshot: eligibility ?? {},
    });
    if (error) console.error("Failed to submit partner application:", error.message);
    setApplyingPartner(false);
  }

  if (!profile) return null;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">{t("creator.dashboard")}</h1>
        <Link href="/creator/upload">
          <Button size="sm">
            <Plus size={15} /> {t("creator.upload")}
          </Button>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-surface p-3.5">
          <p className="text-[11px] text-muted">{t("creator.availableBalance")}</p>
          <p className="mt-1 text-[19px] font-semibold text-text">
            ₦{(wallet?.earnings_balance_naira ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3.5">
          <p className="text-[11px] text-muted">{t("creator.inEscrow")}</p>
          <p className="mt-1 text-[19px] font-semibold text-text">
            ₦{(wallet?.escrow_balance_naira ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {isPartner ? (
        <Link href="/creator/withdraw">
          <Button variant="primary" className="mt-3 w-full">
            {t("creator.requestWithdrawal")}
          </Button>
        </Link>
      ) : (
        <div className="mt-5 rounded-md border border-border bg-surface p-4">
          <p className="text-[14px] font-semibold text-text">{t("creator.partnerProgress")}</p>
          <p className="mt-1 text-[12px] text-muted">
            {t("creator.partnerHint")}
          </p>
          {eligibility ? (
            <div className="mt-3 space-y-2.5">
              <ProgressRow
                label={t("creator.uniqueViews")}
                value={eligibility.unique_views}
                target={eligibility.unique_views_required}
              />
              <ProgressRow
                label={t("creator.watchHours")}
                value={eligibility.watch_hours}
                target={eligibility.watch_hours_required}
              />
              <ProgressRow
                label={t("creator.episodesPublished")}
                value={eligibility.episode_count}
                target={eligibility.episode_count_required}
              />
              <ProgressRow
                label={t("creator.accountAgeDays")}
                value={eligibility.account_age_days}
                target={eligibility.account_age_required}
              />
              <Button
                className="mt-2 w-full"
                disabled={!eligibility.eligible || applyingPartner}
                onClick={applyForPartner}
              >
                {eligibility.eligible ? t("creator.applyPartner") : t("creator.notEligible")}
              </Button>
            </div>
          ) : (
            <Skeleton className="mt-3 h-24 w-full" />
          )}
        </div>
      )}

      <h2 className="font-display mt-7 mb-2.5 text-[17px] font-semibold text-text">{t("creator.yourTitles")}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {titles.map((row) => (
          <li key={row.id}>
            <Link href={`/creator/title/${row.id}`} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-text">{row.title}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {TITLE_STATUS_KEY[row.status] ? t(TITLE_STATUS_KEY[row.status]) : row.status}
                  {row.genre ? ` · ${row.genre}` : ""}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[12px] text-muted">
                <Zap size={11} className="fill-gold text-gold" />
                {row.total_unique_views}
              </span>
            </Link>
          </li>
        ))}
        {!titles.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">{t("creator.noTitles")}</li>
        )}
      </ul>
    </div>
  );
}
