// components/shared/NotificationBell.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

export function NotificationBell() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let ignore = false;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => {
        if (!ignore) setUnread(count ?? 0);
      });

    const topic = `notifications-bell-${user.id}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => setUnread((n) => n + 1)
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <Link href="/notifications" aria-label={t("notifications.bell")} className="relative p-1 text-text">
      <Bell size={22} />
      {unread > 0 && (
        <span className="absolute right-0 top-0 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-crimson ring-2 ring-bg" />
      )}
    </Link>
  );
}
