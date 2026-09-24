"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

type Tab = "applications" | "partners" | "reports" | "settings";

export default function AdminPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<any[]>([]);
  const [partnerApps, setPartnerApps] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  async function loadAll() {
    const [{ data: apps }, { data: pApps }, { data: reps }, { data: s }] = await Promise.all([
      supabase
        .from("creator_applications")
        .select("*, profiles(username, display_name)")
        .eq("status", "pending"),
      supabase
        .from("partner_applications")
        .select("*, profiles(username, display_name)")
        .eq("status", "pending"),
      supabase
        .from("content_reports")
        .select("*, titles(title)")
        .eq("status", "pending"),
      supabase.from("platform_settings").select("*").single(),
    ]);
    setApplications(apps ?? []);
    setPartnerApps(pApps ?? []);
    setReports(reps ?? []);
    setSettings(s);
  }

  useEffect(() => {
    if (profile?.role === "admin") loadAll();
  }, [profile]);

  async function reviewApplication(id: string, userId: string, decision: "approved" | "declined" | "ignored") {
    await supabase
      .from("creator_applications")
      .update({ status: decision, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    if (decision === "approved") {
      await supabase.from("profiles").update({ creator_status: "approved" }).eq("id", userId);
    } else if (decision === "declined") {
      await supabase.from("profiles").update({ creator_status: "declined" }).eq("id", userId);
    }
    loadAll();
  }

  async function reviewPartnerApp(id: string, userId: string, approve: boolean) {
    await supabase
      .from("partner_applications")
      .update({ status: approve ? "approved" : "declined", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    if (approve) {
      await supabase
        .from("creator_partner_state")
        .update({ is_partner: true, partner_since: new Date().toISOString() })
        .eq("user_id", userId);
      await supabase.from("profiles").update({ creator_status: "partner" }).eq("id", userId);
      await supabase.rpc("release_creator_escrow", { p_creator_id: userId });
    }
    loadAll();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("platform_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("id", true);
    loadAll();
  }

  if (profile && profile.role !== "admin") {
    return <p className="px-4 pt-10 text-center text-sm text-muted">Admin access required.</p>;
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "applications", label: "Creators", count: applications.length },
    { key: "partners", label: "Partner apps", count: partnerApps.length },
    { key: "reports", label: "Reports", count: reports.length },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <h1 className="font-display text-xl font-semibold text-text">Admin</h1>

      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "shrink-0 border-b-2 pb-2.5 text-[13px] font-medium",
              tab === t.key ? "border-gold text-text" : "border-transparent text-muted"
            )}
          >
            {t.label} {t.count ? `(${t.count})` : ""}
          </button>
        ))}
      </div>

      {tab === "applications" && (
        <ul className="mt-4 space-y-3">
          {applications.map((a) => (
            <li key={a.id} className="rounded-md border border-border bg-surface p-3.5">
              <p className="text-[14px] font-medium text-text">@{a.profiles?.username}</p>
              <p className="mt-1 text-[13px] text-muted">{a.bio}</p>
              {a.primary_genre && (
                <p className="mt-1 text-[12px] text-muted">Genre: {a.primary_genre}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => reviewApplication(a.id, a.user_id, "approved")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => reviewApplication(a.id, a.user_id, "declined")}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reviewApplication(a.id, a.user_id, "ignored")}
                >
                  Ignore
                </Button>
              </div>
            </li>
          ))}
          {!applications.length && (
            <p className="mt-6 text-center text-sm text-muted">No pending applications.</p>
          )}
        </ul>
      )}

      {tab === "partners" && (
        <ul className="mt-4 space-y-3">
          {partnerApps.map((a) => (
            <li key={a.id} className="rounded-md border border-border bg-surface p-3.5">
              <p className="text-[14px] font-medium text-text">@{a.profiles?.username}</p>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted">
                {JSON.stringify(a.snapshot, null, 2)}
              </pre>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => reviewPartnerApp(a.id, a.user_id, true)}>
                  Approve partner
                </Button>
                <Button size="sm" variant="secondary" onClick={() => reviewPartnerApp(a.id, a.user_id, false)}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
          {!partnerApps.length && (
            <p className="mt-6 text-center text-sm text-muted">No pending partner applications.</p>
          )}
        </ul>
      )}

      {tab === "reports" && (
        <ul className="mt-4 space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface p-3.5">
              <p className="text-[14px] font-medium text-text">{r.titles?.title ?? "Untitled"}</p>
              <p className="mt-1 text-[13px] text-muted">{r.reason}</p>
              {r.details && <p className="mt-1 text-[12px] text-muted">{r.details}</p>}
              <p className="mt-2 text-[11px] text-muted">
                Use the strike flow from a full moderation view once wired up — this MVP view is
                read-only for reports.
              </p>
            </li>
          ))}
          {!reports.length && (
            <p className="mt-6 text-center text-sm text-muted">No pending reports.</p>
          )}
        </ul>
      )}

      {tab === "settings" && settings && (
        <form onSubmit={saveSettings} className="mt-4 space-y-3">
          {[
            ["coin_to_naira", "Coin → Naira rate"],
            ["default_episode_unlock_coins", "Default unlock cost (coins)"],
            ["default_free_episodes", "Default free episodes"],
            ["creator_revenue_share", "Creator revenue share (0–1)"],
            ["min_payout_threshold_naira", "Minimum payout (₦)"],
            ["partner_min_unique_views", "Partner: min unique views"],
            ["partner_min_watch_hours", "Partner: min watch hours"],
            ["partner_min_episodes", "Partner: min episodes"],
            ["strikes_before_suspension", "Strikes before suspension"],
            ["strike_suspension_months", "Suspension length (months)"],
            ["strike_expiry_months", "Strike expiry (months)"],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-[12px] text-muted">{label}</label>
              <input
                type="number"
                step="any"
                value={settings[key] ?? ""}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-[14px] text-text"
              />
            </div>
          ))}
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={!!settings.ads_enabled}
              onChange={(e) => setSettings({ ...settings, ads_enabled: e.target.checked })}
            />
            <span className="text-[13px] text-text">Ads enabled</span>
          </label>
          <Button type="submit" className="w-full">
            Save settings
          </Button>
        </form>
      )}
    </div>
  );
}
