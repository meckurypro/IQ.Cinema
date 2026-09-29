// lib/push.ts
// Browser notification permission + display helpers.
//
// The DB (user_settings.push_permission) is kept in sync with the browser's
// real state by <NotificationListener/>. Browsers never let a page grant
// itself permission or re-prompt after "Block" — for that case the UI tells
// the user to unblock it in browser settings.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PushState = "granted" | "denied" | "default" | "unsupported";

export function getPushState(): PushState {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PushState;
}

// Asks the browser, persists the answer, and (if granted) tries the one-time
// "Turn on notification permission" reward. Used by Settings and Rewards so
// both behave identically.
export async function enablePush(supabase: SupabaseClient, userId: string): Promise<PushState> {
  if (getPushState() === "unsupported") return "unsupported";
  const permission = (await Notification.requestPermission()) as PushState;
  await supabase
    .from("user_settings")
    .upsert({ user_id: userId, push_permission: permission }, { onConflict: "user_id" });
  if (permission === "granted") {
    await supabase.rpc("claim_reward_task", { p_task_key: "enable_notifications" });
  }
  return permission;
}

export async function showBrowserNotification(opts: { id: string; title: string; body?: string | null; href?: string }) {
  if (getPushState() !== "granted") return;
  const options: NotificationOptions = {
    body: opts.body ?? undefined,
    icon: "/IQCinemaIcon.png",
    badge: "/IQCinemaIcon.png",
    tag: opts.id,
    data: { href: opts.href ?? "/notifications" },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(opts.title, options);
        return;
      }
    }
    const n = new Notification(opts.title, options);
    n.onclick = () => {
      window.focus();
      window.location.href = opts.href ?? "/notifications";
    };
  } catch {
    // Display is best-effort; the in-app notification centre still has it.
  }
}
