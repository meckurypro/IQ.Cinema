// app/admin/rewards/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

const supabase = createClient();

type SubTab = "tasks" | "checkin" | "ads" | "offers" | "coupons" | "points";

type RewardTaskRow = {
  key: string;
  kind: string;
  title: string;
  description: string | null;
  reward_coins: number;
  daily_cap: number | null;
  threshold_seconds: number | null;
  action_url: string | null;
  is_active: boolean;
};

type CheckinRow = { day_index: number; coins: number };

type HouseAd = {
  id: string;
  title: string;
  image_url: string | null;
  video_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  duration_seconds: number;
  is_active: boolean;
};

type DailyOfferRow = {
  id: string;
  title_id: string;
  discount_percent: number;
  ends_at: string;
  is_active: boolean;
  titles: { title: string } | null;
};

type CouponTemplate = {
  id: string;
  name: string;
  discount_percent: number;
  valid_days: number;
  is_active: boolean;
};

type PointsItem = {
  id: string;
  kind: "membership_days" | "reward_coins" | "coupon";
  name: string;
  description: string | null;
  cost_points: number;
  membership_days: number | null;
  reward_coins: number | null;
  is_active: boolean;
};

export default function AdminRewardsPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<SubTab>("tasks");

  const [tasks, setTasks] = useState<RewardTaskRow[]>([]);
  const [checkin, setCheckin] = useState<CheckinRow[]>([]);
  const [ads, setAds] = useState<HouseAd[]>([]);
  const [offers, setOffers] = useState<DailyOfferRow[]>([]);
  const [coupons, setCoupons] = useState<CouponTemplate[]>([]);
  const [pointsItems, setPointsItems] = useState<PointsItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    const [{ data: t }, { data: c }, { data: a }, { data: o }, { data: ct }, { data: pi }] = await Promise.all([
      supabase.from("reward_tasks").select("*").order("sort_order"),
      supabase.from("checkin_rewards").select("*").order("day_index"),
      supabase.from("house_ads").select("*").order("created_at", { ascending: false }),
      supabase
        .from("daily_offers")
        .select("*, titles(title)")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("coupon_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("points_items").select("*").order("sort_order"),
    ]);
    setTasks((t as RewardTaskRow[]) ?? []);
    setCheckin((c as CheckinRow[]) ?? []);
    setAds((a as HouseAd[]) ?? []);
    setOffers((o as DailyOfferRow[]) ?? []);
    setCoupons((ct as CouponTemplate[]) ?? []);
    setPointsItems((pi as PointsItem[]) ?? []);
  }

  useEffect(() => {
    if (!loading && profile?.is_admin) loadAll();
  }, [loading, profile?.is_admin]);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile?.is_admin) router.replace("/");
  }, [loading, user, profile, router]);

  if (loading || !user || !profile?.is_admin) return null;

  const TABS: { key: SubTab; label: string }[] = [
    { key: "tasks", label: "Tasks" },
    { key: "checkin", label: "Check-in" },
    { key: "ads", label: "House ads" },
    { key: "offers", label: "Daily offers" },
    { key: "coupons", label: "Coupons" },
    { key: "points", label: "Points items" },
  ];

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Rewards & Store</h1>
      </div>

      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "shrink-0 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
              tab === t.key ? "border-gold text-text" : "border-transparent text-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && <p className="mt-3 text-[12.5px] text-pink">{message}</p>}

      {tab === "tasks" && (
        <TasksTab tasks={tasks} onChange={setTasks} setMessage={setMessage} />
      )}
      {tab === "checkin" && (
        <CheckinTab rows={checkin} onChange={setCheckin} setMessage={setMessage} />
      )}
      {tab === "ads" && <AdsTab ads={ads} onChange={setAds} setMessage={setMessage} />}
      {tab === "offers" && (
        <OffersTab offers={offers} onChange={setOffers} setMessage={setMessage} />
      )}
      {tab === "coupons" && (
        <CouponsTab coupons={coupons} onChange={setCoupons} setMessage={setMessage} />
      )}
      {tab === "points" && (
        <PointsItemsTab items={pointsItems} onChange={setPointsItems} setMessage={setMessage} />
      )}
    </div>
  );
}

function TasksTab({
  tasks,
  onChange,
  setMessage,
}: {
  tasks: RewardTaskRow[];
  onChange: (t: RewardTaskRow[]) => void;
  setMessage: (m: string | null) => void;
}) {
  async function save(t: RewardTaskRow) {
    const { error } = await supabase
      .from("reward_tasks")
      .update({
        title: t.title,
        description: t.description,
        reward_coins: t.reward_coins,
        daily_cap: t.daily_cap,
        threshold_seconds: t.threshold_seconds,
        action_url: t.action_url,
        is_active: t.is_active,
      })
      .eq("key", t.key);
    setMessage(error ? error.message : `Saved "${t.title}".`);
  }

  function patch(key: string, partial: Partial<RewardTaskRow>) {
    onChange(tasks.map((t) => (t.key === key ? { ...t, ...partial } : t)));
  }

  return (
    <div className="mt-4 space-y-3">
      {tasks.map((t) => (
        <div key={t.key} className="rounded-md border border-border bg-surface p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-text">
              {t.title} <span className="text-muted">· {t.kind}</span>
            </p>
            <button
              role="switch"
              aria-checked={t.is_active}
              onClick={() => patch(t.key, { is_active: !t.is_active })}
              className={clsx(
                "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
                t.is_active ? "bg-pink" : "bg-border"
              )}
            >
              <span
                className={clsx(
                  "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  t.is_active ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Reward coins">
              <input
                type="number"
                value={t.reward_coins}
                onChange={(e) => patch(t.key, { reward_coins: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </Field>
            <Field label="Daily cap">
              <input
                type="number"
                value={t.daily_cap ?? ""}
                onChange={(e) =>
                  patch(t.key, { daily_cap: e.target.value ? Number(e.target.value) : null })
                }
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </Field>
            <Field label="Threshold (s)">
              <input
                type="number"
                value={t.threshold_seconds ?? ""}
                onChange={(e) =>
                  patch(t.key, { threshold_seconds: e.target.value ? Number(e.target.value) : null })
                }
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </Field>
          </div>
          {t.kind === "social" && (
            <Field label="Link URL" className="mt-2">
              <input
                value={t.action_url ?? ""}
                onChange={(e) => patch(t.key, { action_url: e.target.value })}
                placeholder="https://…"
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </Field>
          )}
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => save(t)}>
            Save
          </Button>
        </div>
      ))}
    </div>
  );
}

function CheckinTab({
  rows,
  onChange,
  setMessage,
}: {
  rows: CheckinRow[];
  onChange: (r: CheckinRow[]) => void;
  setMessage: (m: string | null) => void;
}) {
  async function saveAll() {
    const { error } = await supabase.from("checkin_rewards").upsert(rows);
    setMessage(error ? error.message : "Check-in schedule saved.");
  }

  return (
    <div className="mt-4 space-y-2">
      {rows.map((r) => (
        <div key={r.day_index} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
          <span className="w-14 text-[13px] font-medium text-text">Day {r.day_index}</span>
          <input
            type="number"
            value={r.coins}
            onChange={(e) =>
              onChange(
                rows.map((x) => (x.day_index === r.day_index ? { ...x, coins: Number(e.target.value) } : x))
              )
            }
            className="h-9 w-24 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <span className="text-[12px] text-muted">coins</span>
        </div>
      ))}
      <Button size="sm" className="mt-2" onClick={saveAll}>
        Save schedule
      </Button>
    </div>
  );
}

function AdsTab({
  ads,
  onChange,
  setMessage,
}: {
  ads: HouseAd[];
  onChange: (a: HouseAd[]) => void;
  setMessage: (m: string | null) => void;
}) {
  const [form, setForm] = useState({ title: "", image_url: "", video_url: "", cta_label: "", cta_url: "", duration_seconds: 15 });

  async function add() {
    if (!form.title.trim()) return;
    const { data, error } = await supabase.from("house_ads").insert(form).select().single();
    if (error) return setMessage(error.message);
    onChange([data as HouseAd, ...ads]);
    setForm({ title: "", image_url: "", video_url: "", cta_label: "", cta_url: "", duration_seconds: 15 });
  }

  async function toggle(a: HouseAd) {
    await supabase.from("house_ads").update({ is_active: !a.is_active }).eq("id", a.id);
    onChange(ads.map((x) => (x.id === a.id ? { ...x, is_active: !x.is_active } : x)));
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">New house ad</p>
        <div className="mt-2 space-y-2">
          <input
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <input
            placeholder="Image URL"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <input
            placeholder="Video URL (optional)"
            value={form.video_url}
            onChange={(e) => setForm({ ...form, video_url: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <div className="flex gap-2">
            <input
              placeholder="CTA label"
              value={form.cta_label}
              onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
            />
            <input
              placeholder="CTA URL"
              value={form.cta_url}
              onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-muted">Duration (s)</label>
            <input
              type="number"
              min={5}
              max={60}
              value={form.duration_seconds}
              onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })}
              className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
            />
          </div>
          <Button size="sm" onClick={add}>
            Add ad
          </Button>
        </div>
      </div>

      {ads.map((a) => (
        <div key={a.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
          <span className="text-[13px] text-text">{a.title}</span>
          <button
            role="switch"
            aria-checked={a.is_active}
            onClick={() => toggle(a)}
            className={clsx(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              a.is_active ? "bg-pink" : "bg-border"
            )}
          >
            <span
              className={clsx(
                "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                a.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function OffersTab({
  offers,
  onChange,
  setMessage,
}: {
  offers: DailyOfferRow[];
  onChange: (o: DailyOfferRow[]) => void;
  setMessage: (m: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const [discount, setDiscount] = useState(20);
  const [endsAt, setEndsAt] = useState("");

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("titles").select("id, title").ilike("title", `%${query}%`).limit(8);
      setResults((data as { id: string; title: string }[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function add() {
    if (!selected) return;
    const payload: Record<string, unknown> = { title_id: selected.id, discount_percent: discount };
    if (endsAt) payload.ends_at = new Date(endsAt).toISOString();
    const { data, error } = await supabase
      .from("daily_offers")
      .insert(payload)
      .select("*, titles(title)")
      .single();
    if (error) return setMessage(error.message);
    onChange([data as DailyOfferRow, ...offers]);
    setSelected(null);
    setQuery("");
  }

  async function toggle(o: DailyOfferRow) {
    await supabase.from("daily_offers").update({ is_active: !o.is_active }).eq("id", o.id);
    onChange(offers.map((x) => (x.id === o.id ? { ...x, is_active: !x.is_active } : x)));
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">New daily offer</p>
        <div className="relative mt-2">
          <input
            placeholder="Search title…"
            value={selected ? selected.title : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
            }}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          {!selected && results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-card">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    className="block w-full px-3 py-2 text-left text-[13px] text-text hover:bg-surface-raised"
                    onClick={() => {
                      setSelected(r);
                      setResults([]);
                    }}
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px] text-muted">% off</label>
          <input
            type="number"
            min={1}
            max={100}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <label className="ml-2 text-[12px] text-muted">Ends</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="h-9 flex-1 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
        </div>
        <Button size="sm" className="mt-2.5" disabled={!selected} onClick={add}>
          Add offer
        </Button>
      </div>

      {offers.map((o) => (
        <div key={o.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
          <div>
            <p className="text-[13px] text-text">{o.titles?.title ?? o.title_id}</p>
            <p className="text-[11.5px] text-muted">
              {o.discount_percent}% off · ends {new Date(o.ends_at).toLocaleString()}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={o.is_active}
            onClick={() => toggle(o)}
            className={clsx(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              o.is_active ? "bg-pink" : "bg-border"
            )}
          >
            <span
              className={clsx(
                "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                o.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function CouponsTab({
  coupons,
  onChange,
  setMessage,
}: {
  coupons: CouponTemplate[];
  onChange: (c: CouponTemplate[]) => void;
  setMessage: (m: string | null) => void;
}) {
  const [form, setForm] = useState({ name: "", discount_percent: 20, valid_days: 7 });
  const [grantUsername, setGrantUsername] = useState("");
  const [grantTemplateId, setGrantTemplateId] = useState<string | null>(null);

  async function add() {
    if (!form.name.trim()) return;
    const { data, error } = await supabase.from("coupon_templates").insert(form).select().single();
    if (error) return setMessage(error.message);
    onChange([data as CouponTemplate, ...coupons]);
    setForm({ name: "", discount_percent: 20, valid_days: 7 });
  }

  async function toggle(c: CouponTemplate) {
    await supabase.from("coupon_templates").update({ is_active: !c.is_active }).eq("id", c.id);
    onChange(coupons.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
  }

  async function grant(templateId: string, toEveryone: boolean) {
    let userId: string | null = null;
    if (!toEveryone) {
      if (!grantUsername.trim()) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", grantUsername.trim())
        .maybeSingle();
      if (!p) return setMessage("No user with that username.");
      userId = p.id;
    }
    const { data, error } = await supabase.rpc("admin_grant_coupon", {
      p_template_id: templateId,
      p_user_id: userId,
    });
    setMessage(error ? error.message : data?.ok ? `Granted to ${data.granted} user(s).` : data?.error);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">New coupon template</p>
        <div className="mt-2 flex gap-2">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px] text-muted">% off</label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.discount_percent}
            onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
            className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          <label className="ml-2 text-[12px] text-muted">Valid days</label>
          <input
            type="number"
            min={1}
            value={form.valid_days}
            onChange={(e) => setForm({ ...form, valid_days: Number(e.target.value) })}
            className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
        </div>
        <Button size="sm" className="mt-2.5" onClick={add}>
          Add template
        </Button>
      </div>

      <div className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Grant to a user</p>
        <input
          placeholder="Username (leave blank + Grant to all)"
          value={grantUsername}
          onChange={(e) => setGrantUsername(e.target.value)}
          className="mt-2 h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
        />
        <select
          value={grantTemplateId ?? ""}
          onChange={(e) => setGrantTemplateId(e.target.value || null)}
          className="mt-2 h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
        >
          <option value="">Select a template…</option>
          {coupons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.discount_percent}%)
            </option>
          ))}
        </select>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!grantTemplateId || !grantUsername.trim()}
            onClick={() => grantTemplateId && grant(grantTemplateId, false)}
          >
            Grant to user
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!grantTemplateId}
            onClick={() => grantTemplateId && grant(grantTemplateId, true)}
          >
            Grant to everyone
          </Button>
        </div>
      </div>

      {coupons.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
          <span className="text-[13px] text-text">
            {c.name} · {c.discount_percent}% · {c.valid_days}d
          </span>
          <button
            role="switch"
            aria-checked={c.is_active}
            onClick={() => toggle(c)}
            className={clsx(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              c.is_active ? "bg-pink" : "bg-border"
            )}
          >
            <span
              className={clsx(
                "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                c.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function PointsItemsTab({
  items,
  onChange,
  setMessage,
}: {
  items: PointsItem[];
  onChange: (i: PointsItem[]) => void;
  setMessage: (m: string | null) => void;
}) {
  const [form, setForm] = useState<{
    kind: PointsItem["kind"];
    name: string;
    cost_points: number;
    membership_days: number;
    reward_coins: number;
  }>({ kind: "reward_coins", name: "", cost_points: 500, membership_days: 1, reward_coins: 50 });

  async function add() {
    if (!form.name.trim()) return;
    const payload: Record<string, unknown> = {
      kind: form.kind,
      name: form.name,
      cost_points: form.cost_points,
      membership_days: form.kind === "membership_days" ? form.membership_days : null,
      reward_coins: form.kind === "reward_coins" ? form.reward_coins : null,
    };
    const { data, error } = await supabase.from("points_items").insert(payload).select().single();
    if (error) return setMessage(error.message);
    onChange([...items, data as PointsItem]);
    setForm({ ...form, name: "" });
  }

  async function toggle(i: PointsItem) {
    await supabase.from("points_items").update({ is_active: !i.is_active }).eq("id", i.id);
    onChange(items.map((x) => (x.id === i.id ? { ...x, is_active: !x.is_active } : x)));
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">New redemption item</p>
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as PointsItem["kind"] })}
          className="mt-2 h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
        >
          <option value="reward_coins">Reward coins</option>
          <option value="membership_days">Membership days</option>
        </select>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-2 h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-text"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px] text-muted">Cost (points)</label>
          <input
            type="number"
            value={form.cost_points}
            onChange={(e) => setForm({ ...form, cost_points: Number(e.target.value) })}
            className="h-9 w-24 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
          />
          {form.kind === "membership_days" ? (
            <>
              <label className="ml-2 text-[12px] text-muted">Days</label>
              <input
                type="number"
                value={form.membership_days}
                onChange={(e) => setForm({ ...form, membership_days: Number(e.target.value) })}
                className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </>
          ) : (
            <>
              <label className="ml-2 text-[12px] text-muted">Coins</label>
              <input
                type="number"
                value={form.reward_coins}
                onChange={(e) => setForm({ ...form, reward_coins: Number(e.target.value) })}
                className="h-9 w-20 rounded-md border border-border bg-bg px-2 text-[13px] text-text"
              />
            </>
          )}
        </div>
        <Button size="sm" className="mt-2.5" onClick={add}>
          Add item
        </Button>
      </div>

      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
          <span className="text-[13px] text-text">
            {i.name} · {i.cost_points} pts
          </span>
          <button
            role="switch"
            aria-checked={i.is_active}
            onClick={() => toggle(i)}
            className={clsx(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              i.is_active ? "bg-pink" : "bg-border"
            )}
          >
            <span
              className={clsx(
                "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                i.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[11px] text-muted">{label}</label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
