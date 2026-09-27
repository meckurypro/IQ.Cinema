"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("iq-theme") as ThemeMode) || "system";
    setMode(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (isDark: boolean) => {
      root.classList.toggle("dark", isDark);
      // Keep the browser's own chrome (status bar / toolbar) in sync — same
      // hex values as --bg in globals.css and in ThemeScript's first-paint
      // version of this.
      const meta = document.getElementById("theme-color-meta");
      meta?.setAttribute("content", isDark ? "#0b0c10" : "#faf9f7");
    };

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const listener = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }

    apply(mode === "dark");
  }, [mode]);

  const setTheme = (next: ThemeMode) => {
    setMode(next);
    localStorage.setItem("iq-theme", next);
  };

  return { mode, setTheme };
}
