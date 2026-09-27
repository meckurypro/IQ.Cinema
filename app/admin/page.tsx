// app/admin/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

type Tab = "applications" | "partners" | "reports" | "settings" | "links" | "users";

type FeatureFlag = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
};

type UserRole = "viewer" | "creator" | "staff" | "admin";

type SearchedProfile = {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  creator_status: "none" | "applied" | "approved" | "declined" | "ignored" | "partner";
};

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<any[]>([]);
  const [partnerApps, setPartnerApps] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<SearchedProfile[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);

  async function loadAll() {
    const [{ data: apps }, { data: pApps }, { data: reps }, { data: s }, { data: f }] =
      await Promise.all([
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
        supabase.from("feature_flags").select("*").order("label"),
      ]);
    setApplications(apps ?? []);
    setPartnerApps(pApps ?? []);
    setReports(reps ?? []);
    setSettings(s);
    setFlags(f ?? []);
  }

  async function toggleFlag(key: string, enabled: boolean) {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
    await supabase
      .from("feature_flags")
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq("key", key);
  }

  async function searchUsers(e?: React.FormEvent) {
    e?.preventDefault();
    const q = userQuery.trim();
    if (!q) {
      setUserResults([]);
      return;
    }
    setUserSearchLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, role, creator_status")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20);
    setUserResults((data as SearchedProfile[]) ?? []);
    setUserSearchLoading(false);
  }

  function patchUserResult(id: string, patch: Partial<SearchedProfile>) {
    setUserResults((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function setRole(u: SearchedProfile, role: UserRole) {
    setUserActionId(u.id);
    await supabase.from("profiles").update({ role }).eq("id", u.id);
    patchUserResult(u.id, { role });
    setUserActionId(null);
  }

  async function makePartner(u: SearchedProfile) {
    setUserActionId(u.id);
    await supabase
      .from("profiles")
      .update({ role: "creator", creator_status: "partner" })
      .eq("id", u.id);
    await supabase.from("creator_partner_state").upsert({
      user_id: u.id,
      is_partner: true,
      partner_since: new Date().toISOString(),
    });
    patchUserResult(u.id, { role: "creator", creator_status: "partner" });
    setUserActionId(null);
  }

  // Mirrors the middleware's server-side redirect for the moment the client
  // takes over — the middleware is what actually enforces this, this is just
  // belt-and-suspenders so a stale client render never flashes admin data.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login?next=%2Fadmin");
      return;
    }
    if (profile && profile.role !== "admin") {
      router.replace("/");
      return;
    }
    if (profile?.role === "admin") loadAll();
  }, [loading, user, profile]);

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

  if (loading || !user || profile?.role !== "admin") {
    return null;
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "applications", label: "Creators", count: applications.length },
    { key: "partners", label: "Partner apps", count: partnerApps.length },
    { key: "reports", label: "Reports", count: reports.length },
    { key: "links", label: "Links" },
    { key: "users", label: "Users" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <h1 className="font-display text-2xl font-semibold text-text">Admin</h1>

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

      {tab === "links" && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] text-muted">
            Turn a link off to hide it from every user's profile page — no code changes needed.
          </p>
          <ul className="space-y-3">
            {flags.map((f) => (
              <li
                key={f.key}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3.5"
              >
                <div className="pr-3">
                  <p className="text-[14px] font-medium text-text">{f.label}</p>
                  {f.description && (
                    <p className="mt-0.5 text-[12px] text-muted">{f.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={f.label}
                  onClick={() => toggleFlag(f.key, !f.enabled)}
                  className={clsx(
                    "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    f.enabled ? "bg-pink" : "bg-border"
                  )}
                >
                  <span
                    className={clsx(
                      "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                      f.enabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </li>
            ))}
            {!flags.length && (
              <p className="mt-6 text-center text-sm text-muted">No links configured yet.</p>
            )}
          </ul>
        </div>
      )}

      {tab === "users" && (
        <div className="mt-4 space-y-3">
          <form onSubmit={searchUsers} className="flex gap-2">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search by username or name"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[14px] text-text"
            />
            <Button type="submit" size="md">
              Search
            </Button>
          </form>

          {userSearchLoading && <p className="text-[13px] text-muted">Searching…</p>}

          <ul className="space-y-3">
            {userResults.map((u) => (
              <li key={u.id} className="rounded-md border border-border bg-surface p-3.5">
                <p className="text-[14px] font-medium text-text">
                  @{u.username}
                  {u.display_name ? ` — ${u.display_name}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  Role: {u.role} · Creator status: {u.creator_status}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={userActionId === u.id}
                    onClick={() => setRole(u, "creator")}
                  >
                    Make creator
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={userActionId === u.id}
                    onClick={() => makePartner(u)}
                  >
                    Make partner
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={userActionId === u.id}
                    onClick={() => setRole(u, "staff")}
                  >
                    Make staff
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={userActionId === u.id}
                    onClick={() => setRole(u, "admin")}
                  >
                    Make admin
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={userActionId === u.id}
                    onClick={() => setRole(u, "viewer")}
                  >
                    Reset to viewer
                  </Button>
                </div>
              </li>
            ))}
            {!userResults.length && !userSearchLoading && userQuery && (
              <p className="mt-6 text-center text-sm text-muted">No matching users.</p>
            )}
          </ul>
        </div>
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
