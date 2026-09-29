// components/shared/NotificationListener.tsx

"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getPushState, showBrowserNotification } from "@/lib/push";

const supabase = createClient();

// Mounted once in the root layout. Two jobs:
//  1. Keep user_settings.push_permission equal to the browser's real permission
//     (granting, or revoking it later in browser settings), so the DB — not
//     just the UI — always reflects reality.
//  2. Show new in-app notifications as system notifications while permission
//     is granted. The rows themselves are created server-side (triggers / cron)
//     and already respect the user's notification toggles.
export function NotificationListener() {
  const { user } = useAuth();
  const { settings, loaded, update } = useUserSettings();

  useEffect(() => {
    if (!user || !loaded) return;
    const sync = () => {
      const state = getPushState();
      if (state !== "unsupported" && state !== settings.push_permission) {
        update({ push_permission: state });
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [user, loaded, settings.push_permission, update]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-os-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { id: string; title: string; body: string | null; metadata: { href?: string } | null };
          showBrowserNotification({ id: n.id, title: n.title, body: n.body, href: n.metadata?.href });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
