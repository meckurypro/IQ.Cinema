// components/shared/ServiceWorkerRegister.tsx

"use client";

import { useEffect } from "react";

// Registers the offline shell (public/sw.js) so the app can open and play
// in-app downloads with no connection. Production only — a service worker in
// `next dev` would serve stale bundles while developing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline shell is an enhancement; the app works online without it.
    });
  }, []);
  return null;
}
