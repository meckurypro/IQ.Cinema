// app/admin/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

type Tab =
  | "applications"
  | "partners"
  | "projects"
  | "reports"
  | "settings"
  | "links"
  | "users"
  | "withdrawals";

type ReviewTitle = {
  id: string;
  title: string;
  synopsis: string | null;
  genre: string | null;
  content_type: string;
  poster_url: string | null;
  review_ignored_at: string | null;
  profiles: { username: string; display_name: string | null } | null;
};

type FeatureFlag = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
};

// `role` only ever represents the content-tier progression now (viewer ->
// creator, with "partner" layered on top via creator_status/is_partner
// rather than being its own role value). Staff and admin are independent
// flags — any tier can also be staff, and/or also be admin.
type ContentTier = "viewer" | "creator" | "partner";

type SearchedProfile = {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  role: "viewer" | "creator";
  creator_status: "none" | "applied" | "approved" | "declined" | "ignored" | "partner";
  is_partner: boolean;
  is_staff: boolean;
  is_admin: boolean;
};

type WithdrawalRequest = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  email: string;
  amount_naira: number;
  bank_account_name: string;
  bank_account_number: string;
  bank_code: string;
  status: "requested" | "approved" | "paid" | "declined";
  requested_at: string;
};

// Viewer / Creator / Partner is a single progression — exactly one is
// active at a time — so these stay a linked group. Staff and admin are
// rendered separately below as fully independent switches.
const TIER_OPTIONS: { key: ContentTier; label: string }[] = [
  { key: "viewer", label: "Viewer" },
  { key: "creator", label: "Creator" },
  { key: "partner", label: "Partner" },
];

function tierOf(u: Pick<SearchedProfile, "role" | "creator_status">): ContentTier {
  if (u.creator_status === "partner") return "partner";
  if (u.role === "creator") return "creator";
  return "viewer";
}

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("projects");
  const [applications, setApplications] = useState<any[]>([]);
  const [partnerApps, setPartnerApps] = useState<any[]>([]);
  const [reviewTitles, setReviewTitles] = useState<ReviewTitle[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [titleActionId, setTitleActionId] = useState<string | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<SearchedProfile[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  // Bumped on every keystroke so a slow, now-stale request can't clobber the
  // results of a newer one that resolved first.
  const userSearchSeq = useRef(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalActionId, setWithdrawalActionId] = useState<string | null>(null);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);

  async function loadAll() {
    const [{ data: apps }, { data: pApps }, { data: titles }, { data: reps }, { data: s }, { data: f }, { data: w }] =
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
          .from("titles")
          .select(
            "id, title, synopsis, genre, content_type, poster_url, review_ignored_at, profiles!titles_creator_id_fkey(username, display_name)"
          )
          .eq("status", "in_review")
          .order("created_at", { ascending: true }),
        supabase
          .from("content_reports")
          .select("*, titles(title)")
          .eq("status", "pending"),
        supabase.from("platform_settings").select("*").single(),
        supabase.from("feature_flags").select("*").order("label"),
        supabase.rpc("admin_list_withdrawals", { p_status: "requested" }),
      ]);
    setApplications(apps ?? []);
    setPartnerApps(pApps ?? []);
    setReviewTitles(((titles as any[]) ?? []).map((t) => ({ ...t, profiles: Array.isArray(t.profiles) ? t.profiles[0] : t.profiles })));
    setReports(reps ?? []);
    setSettings(s);
    setFlags(f ?? []);
    setWithdrawals((w as WithdrawalRequest[]) ?? []);
  }

  async function reviewTitle(titleId: string, decision: "approved" | "declined" | "ignored") {
    setTitleActionId(titleId);
    const note =
      decision === "declined"
        ? window.prompt("Reason for declining (shown to the creator):") ?? undefined
        : undefined;
    if (decision === "declined" && note === undefined) {
      setTitleActionId(null);
      return; // creator cancelled the prompt
    }
    const { data, error } = await supabase.rpc("admin_review_title", {
      p_title_id: titleId,
      p_decision: decision,
      p_note: note || null,
    });
    if (!error && data?.ok) {
      if (decision === "ignored") {
        setReviewTitles((prev) =>
          prev.map((t) => (t.id === titleId ? { ...t, review_ignored_at: new Date().toISOString() } : t))
        );
      } else {
        setReviewTitles((prev) => prev.filter((t) => t.id !== titleId));
      }
    }
    setTitleActionId(null);
  }

  async function toggleFlag(key: string, enabled: boolean) {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
    await supabase
      .from("feature_flags")
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq("key", key);
  }

  // Live search, WhatsApp-style: fires ~250ms after typing settles rather than
  // waiting for a submit. admin_search_users is a SECURITY DEFINER RPC (admin
  // gated server-side too) that can join auth.users, so it matches email as
  // well as username/display name — the client can't query auth.users directly.
  useEffect(() => {
    const q = userQuery.trim();
    if (!q) {
      setUserResults([]);
      setUserSearchLoading(false);
      return;
    }
    setUserSearchLoading(true);
    const seq = ++userSearchSeq.current;
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_search_users", { p_query: q });
      if (seq !== userSearchSeq.current) return; // superseded by a newer keystroke
      setUserResults(!error && data ? (data as SearchedProfile[]) : []);
      setUserSearchLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [userQuery]);

  function patchUserResult(id: string, patch: Partial<SearchedProfile>) {
    setUserResults((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // All three mutations go through admin_update_user_access so the server
  // stays the single source of truth for the partner-implies-creator rule —
  // the client never assembles role/creator_status/is_partner by hand.
  async function setTier(u: SearchedProfile, tier: ContentTier) {
    if (tier === tierOf(u)) return; // already at this tier — no-op
    setUserActionId(u.id);
    const { data, error } = await supabase.rpc("admin_update_user_access", {
      p_user_id: u.id,
      p_tier: tier,
    });
    if (!error && data?.ok) {
      const creator_status = tier === "partner" ? "partner" : tier === "creator" ? "approved" : "none";
      const role = tier === "viewer" ? "viewer" : "creator";
      patchUserResult(u.id, { role, creator_status, is_partner: tier === "partner" });
    }
    setUserActionId(null);
  }

  // Staff and admin are independent of tier and of each other — this can
  // never silently clear the other three fields the way the old single
  // `role` column used to.
  async function setStaff(u: SearchedProfile, isStaff: boolean) {
    setUserActionId(u.id);
    const { data, error } = await supabase.rpc("admin_update_user_access", {
      p_user_id: u.id,
      p_is_staff: isStaff,
    });
    if (!error && data?.ok) patchUserResult(u.id, { is_staff: isStaff });
    setUserActionId(null);
  }

  async function setAdmin(u: SearchedProfile, isAdmin: boolean) {
    setUserActionId(u.id);
    const { data, error } = await supabase.rpc("admin_update_user_access", {
      p_user_id: u.id,
      p_is_admin: isAdmin,
    });
    if (!error && data?.ok) patchUserResult(u.id, { is_admin: isAdmin });
    setUserActionId(null);
  }

  const [grantAmount, setGrantAmount] = useState("");
  const [grantCurrency, setGrantCurrency] = useState<"coins" | "reward_coins" | "points">("reward_coins");
  const [grantMessage, setGrantMessage] = useState<string | null>(null);

  async function grantCurrencyTo(u: SearchedProfile) {
    const amount = Number(grantAmount);
    if (!amount || amount <= 0) return;
    setUserActionId(u.id);
    setGrantMessage(null);
    const { data, error } = await supabase.rpc("admin_grant_currency", {
      p_user_id: u.id,
      p_currency: grantCurrency,
      p_amount: amount,
      p_note: "admin panel grant",
    });
    setUserActionId(null);
    setGrantMessage(!error && data?.ok ? "Granted." : data?.error ?? "Failed to grant.");
    if (!error && data?.ok) setGrantAmount("");
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
    if (profile && !profile.is_admin) {
      router.replace("/");
      return;
    }
    if (profile?.is_admin) loadAll();
  }, [loading, user, profile]);

  async function reviewApplication(id: string, userId: string, decision: "approved" | "declined" | "ignored") {
    await supabase
      .from("creator_applications")
      .update({ status: decision, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    if (decision === "approved") {
      await supabase
        .from("profiles")
        .update({ role: "creator", creator_status: "approved" })
        .eq("id", userId);
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
      await supabase
        .from("profiles")
        .update({ role: "creator", creator_status: "partner" })
        .eq("id", userId);
      await supabase.rpc("release_creator_escrow", { p_creator_id: userId });
    }
    loadAll();
  }

  async function approveWithdrawal(w: WithdrawalRequest) {
    setWithdrawalError(null);
    setWithdrawalActionId(w.id);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setWithdrawalError("Not signed in.");
      setWithdrawalActionId(null);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-withdrawal`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ withdrawalId: w.id }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Transfer failed");
      setWithdrawals((prev) => prev.filter((x) => x.id !== w.id));
    } catch (e) {
      setWithdrawalError((e as Error).message);
    }
    setWithdrawalActionId(null);
  }

  async function declineWithdrawal(w: WithdrawalRequest) {
    setWithdrawalError(null);
    setWithdrawalActionId(w.id);
    const { data, error } = await supabase.rpc("admin_decline_withdrawal", {
      p_withdrawal_id: w.id,
    });
    if (error || !data?.ok) {
      setWithdrawalError(error?.message || data?.error || "Could not decline withdrawal");
      setWithdrawalActionId(null);
      return;
    }
    setWithdrawals((prev) => prev.filter((x) => x.id !== w.id));
    setWithdrawalActionId(null);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("platform_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("id", true);
    loadAll();
  }

  if (loading || !user || !profile?.is_admin) {
    return null;
  }

  const pendingReviewTitles = reviewTitles.filter((t) => !t.review_ignored_at);
  const ignoredReviewTitles = reviewTitles.filter((t) => t.review_ignored_at);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "projects", label: "Projects", count: pendingReviewTitles.length },
    { key: "applications", label: "Creators", count: applications.length },
    { key: "partners", label: "Partner apps", count: partnerApps.length },
    { key: "withdrawals", label: "Withdrawals", count: withdrawals.length },
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
              "shrink-0 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
              tab === t.key ? "border-gold text-text" : "border-transparent text-muted"
            )}
          >
            {t.label} {t.count ? `(${t.count})` : ""}
          </button>
        ))}
        <Link
          href="/admin/rewards"
          className="shrink-0 border-b-2 border-transparent pb-2.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
        >
          Rewards & Store ↗
        </Link>
      </div>

      {tab === "projects" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-muted">
              Approve makes the project (and its finalized episodes) live. Decline sends it back to
              the creator with a note. Ignore leaves it in review for now — revisit anytime.
            </p>
          </div>
          <ul className="space-y-3">
            {(showIgnored ? ignoredReviewTitles : pendingReviewTitles).map((t) => (
              <li key={t.id} className="rounded-md border border-border bg-surface p-3.5">
                <p className="text-[14px] font-medium text-text">{t.title}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {t.genre ?? "No genre"} · {t.content_type.replace(/_/g, " ")}
                  {t.profiles?.username ? ` · by @${t.profiles.username}` : ""}
                </p>
                {t.synopsis && <p className="mt-1.5 text-[13px] text-muted">{t.synopsis}</p>}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={titleActionId === t.id}
                    onClick={() => reviewTitle(t.id, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={titleActionId === t.id}
                    onClick={() => reviewTitle(t.id, "declined")}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={titleActionId === t.id}
                    onClick={() => reviewTitle(t.id, "ignored")}
                  >
                    Ignore
                  </Button>
                </div>
              </li>
            ))}
            {!(showIgnored ? ignoredReviewTitles : pendingReviewTitles).length && (
              <p className="mt-6 text-center text-sm text-muted">
                {showIgnored ? "Nothing ignored." : "No projects awaiting review."}
              </p>
            )}
          </ul>
          {ignoredReviewTitles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIgnored((v) => !v)}
              className="text-[12px] font-medium text-muted underline underline-offset-2"
            >
              {showIgnored
                ? "Back to pending review"
                : `Show ignored (${ignoredReviewTitles.length})`}
            </button>
          )}
        </div>
      )}

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
                  variant="danger"
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
                <Button size="sm" variant="danger" onClick={() => reviewPartnerApp(a.id, a.user_id, false)}>
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

      {tab === "withdrawals" && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] text-muted">
            Approve fires a real Paystack transfer to the creator's bank account. Decline returns
            the held amount to their balance.
          </p>
          {withdrawalError && (
            <p className="rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">
              {withdrawalError}
            </p>
          )}
          <ul className="space-y-3">
            {withdrawals.map((w) => (
              <li key={w.id} className="rounded-md border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-text">
                      @{w.username}
                      {w.display_name ? ` — ${w.display_name}` : ""}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">{w.email}</p>
                  </div>
                  <p className="font-display text-[17px] font-semibold text-text">
                    ₦{Number(w.amount_naira).toLocaleString()}
                  </p>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  {w.bank_account_name} · {w.bank_account_number} · {w.bank_code}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Requested {new Date(w.requested_at).toLocaleString()}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={withdrawalActionId === w.id}
                    onClick={() => approveWithdrawal(w)}
                  >
                    {withdrawalActionId === w.id ? "Processing…" : "Approve & pay out"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={withdrawalActionId === w.id}
                    onClick={() => declineWithdrawal(w)}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!withdrawals.length && (
            <p className="mt-6 text-center text-sm text-muted">No pending withdrawal requests.</p>
          )}
        </div>
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
          <input
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Search by username, name, or email"
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[14px] text-text"
            autoComplete="off"
          />

          {userSearchLoading && <p className="text-[13px] text-muted">Searching…</p>}

          <ul className="space-y-3">
            {userResults.map((u) => (
              <li key={u.id} className="rounded-md border border-border bg-surface p-3.5">
                <p className="text-[14px] font-medium text-text">
                  @{u.username}
                  {u.display_name ? ` — ${u.display_name}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">{u.email}</p>

                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Content tier — viewer applies to become creator, creator applies to become
                  partner
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((opt) => {
                    const active = tierOf(u) === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="switch"
                        aria-checked={active}
                        disabled={userActionId === u.id}
                        onClick={() => setTier(u, opt.key)}
                        className={clsx(
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                          active
                            ? "border-pink bg-pink/15 text-pink"
                            : "border-border text-muted hover:text-text"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Staff &amp; admin — independent of content tier and of each other
                </p>
                <div className="mt-1.5 space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-border bg-bg/40 px-3 py-2.5">
                    <p className="text-[13px] font-medium text-text">Staff</p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.is_staff}
                      aria-label="Staff"
                      disabled={userActionId === u.id}
                      onClick={() => setStaff(u, !u.is_staff)}
                      className={clsx(
                        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50",
                        u.is_staff ? "bg-pink" : "bg-border"
                      )}
                    >
                      <span
                        className={clsx(
                          "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                          u.is_staff ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border bg-bg/40 px-3 py-2.5">
                    <p className="text-[13px] font-medium text-text">Admin</p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.is_admin}
                      aria-label="Admin"
                      disabled={userActionId === u.id}
                      onClick={() => setAdmin(u, !u.is_admin)}
                      className={clsx(
                        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50",
                        u.is_admin ? "bg-pink" : "bg-border"
                      )}
                    >
                      <span
                        className={clsx(
                          "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                          u.is_admin ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Grant currency
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <select
                    value={grantCurrency}
                    onChange={(e) => setGrantCurrency(e.target.value as typeof grantCurrency)}
                    className="h-10 rounded-md border border-border bg-surface px-2 text-[13px] text-text"
                  >
                    <option value="coins">Coins</option>
                    <option value="reward_coins">Reward coins</option>
                    <option value="points">Points</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    placeholder="Amount"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    className="h-10 w-24 rounded-md border border-border bg-surface px-2 text-[13px] text-text"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={userActionId === u.id || !grantAmount}
                    onClick={() => grantCurrencyTo(u)}
                  >
                    Grant
                  </Button>
                </div>
                {grantMessage && <p className="mt-1 text-[11.5px] text-muted">{grantMessage}</p>}
              </li>
            ))}
            {!userResults.length && !userSearchLoading && userQuery.trim() && (
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
            ["reward_coin_creator_share", "Creator share of reward-coin spend (0–1)"],
            ["points_box_min", "Daily points box — min"],
            ["points_box_max", "Daily points box — max"],
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
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={!!settings.points_box_vip_only}
              onChange={(e) => setSettings({ ...settings, points_box_vip_only: e.target.checked })}
            />
            <span className="text-[13px] text-text">Daily points box is VIP-only</span>
          </label>
          <Button type="submit" className="w-full">
            Save settings
          </Button>
        </form>
      )}
    </div>
  );
}
