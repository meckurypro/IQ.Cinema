// hooks/useOnline.ts
//
// Tracks whether the browser has a network connection. Starts `true` so the
// server render and first client render agree, then syncs on mount.

"use client";

import { useEffect, useState } from "react";

export function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
