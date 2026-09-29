// app/admin/promos/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

const supabase = createClient();

// Sends a promotion to every user who has "Promotions" switched on in Settings.
// The server (admin_send_promo) enforces admin-only access and the opt-in filter.
export default function AdminPromosPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile?.is_admin) router.replace("/");
  }, [loading, user, profile, router]);

  if (loading || !user || !profile?.is_admin) return null;

  async function send() {
    if (!window.confirm("Send this promotion to everyone who opted in?")) return;
    setBusy(true);
    setResult(null);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("admin_send_promo", {
      p_title: title,
      p_body: body || null,
      p_href: href.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("href_must_be_in_app_path")
          ? "The link must be an in-app path starting with / (for example /title/my-show)."
          : rpcError.message.includes("title_required")
            ? "Add a title."
            : rpcError.message
      );
      return;
    }
    setResult(`Sent to ${data as number} user${data === 1 ? "" : "s"}.`);
    setTitle("");
    setBody("");
    setHref("");
  }

  const field = "w-full rounded-md border border-border bg-surface px-3 text-[14px] text-text outline-none focus:border-pink";

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Send promotion</h1>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Delivered to users who turned on “Promotions” in Settings. Appears in their notifications and, if they allowed
        it, as a system notification.
      </p>

      <div className="mt-4 space-y-3">
        <input className={`${field} h-11`} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <textarea className={`${field} py-2.5`} rows={3} placeholder="Message (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} />
        <input className={`${field} h-11`} placeholder="Opens page (optional, e.g. /title/my-show)" value={href} onChange={(e) => setHref(e.target.value)} />
        {error && <p className="rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">{error}</p>}
        {result && <p className="rounded-md bg-surface-raised px-3 py-2 text-[13px] text-text">{result}</p>}
        <Button className="w-full" disabled={busy || !title.trim()} onClick={send}>
          {busy ? "Sending…" : "Send promotion"}
        </Button>
      </div>
    </div>
  );
}
