// hooks/useFeatureFlags.ts

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Admin-controlled switches (public.feature_flags). Flags that don't exist yet
// fall back to `fallback` (default: on) so a missing row never hides a feature.
export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("feature_flags")
      .select("key, enabled")
      .then(({ data }) => {
        if (!mounted) return;
        setFlags(Object.fromEntries((data ?? []).map((f) => [f.key as string, Boolean(f.enabled)])));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    loaded: flags !== null,
    isOn: (key: string, fallback = true) => (flags && key in flags ? flags[key] : fallback),
  };
}
