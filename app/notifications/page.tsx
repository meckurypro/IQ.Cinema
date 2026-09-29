// app/notifications/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  metadata: { href?: string } | null;
  created_at: string;
};

const supabase = createClient();

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setItems((data as Notification[]) ?? []));
  }, [user]);

  async function open(n: Notification) {
    if (!n.read) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
    }
    if (n.metadata?.href) router.push(n.metadata.href);
  }

  async function remove(id: string) {
    setItems((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    await supabase.from("notifications").delete().eq("id", id);
  }

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/rewards" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Notifications</h1>
      </div>

      {authLoading || !user ? null : items === null ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <Bell size={28} className="text-muted" />
          <p className="text-[14px] text-muted">Nothing here yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={clsx(
                "flex items-start gap-3 rounded-lg border border-border px-3.5 py-3",
                n.read ? "bg-surface" : "bg-pink/5"
              )}
            >
              <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                <p className="text-[14px] font-medium text-text">{n.title}</p>
                {n.body && <p className="mt-0.5 text-[12.5px] text-muted">{n.body}</p>}
              </button>
              <button
                type="button"
                aria-label="Delete notification"
                onClick={() => remove(n.id)}
                className="mt-0.5 text-muted"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
