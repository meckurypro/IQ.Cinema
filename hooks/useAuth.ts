"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  // `role` is only ever the content tier now (partner is layered on top via
  // creator_status). Staff and admin are independent flags — any tier can
  // also be staff and/or admin at the same time.
  role: "viewer" | "creator";
  creator_status: "none" | "applied" | "approved" | "declined" | "ignored" | "partner";
  is_staff: boolean;
  is_admin: boolean;
};

const supabase = createClient();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Bumped on every user change so a slow profile fetch from a
    // superseded user (e.g. sign-out immediately followed by sign-in)
    // can't land after a newer one and overwrite it.
    let requestId = 0;

    async function loadProfile(userId: string, thisRequest: number) {
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (mounted && thisRequest === requestId) setProfile(p as Profile);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      if (data.user) {
        requestId += 1;
        loadProfile(data.user.id, requestId);
      }
      setLoading(false);
    });

    // Covers sign-in/sign-out happening while this component is already
    // mounted (e.g. after the auth callback redirects back), not just the
    // state at first mount — the initial getUser() above only captures a
    // snapshot.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      requestId += 1;
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id, requestId);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // supabase is a module-level singleton (stable identity), so this only
    // needs to run once per mount.
  }, []);

  return { user, profile, loading };
}
