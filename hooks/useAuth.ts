// hooks/useAuth.tsx

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const supabase = createClient();

// This used to be plain logic inside the useAuth() hook itself, which meant
// every component that called useAuth() ran its own independent copy of
// this effect. On /creator/dashboard, both app/creator/layout.tsx and
// app/creator/dashboard/page.tsx call useAuth() and mount at the same time,
// so two separate effect instances each tried to open a realtime channel
// named `profile-live-${user.id}` — identical topic, same user.
//
// supabase.channel(topic) is a lookup, not a constructor: the second
// caller got back the SAME already-subscribed channel the first caller
// created, and calling `.on(...)` on a channel that's already had
// `.subscribe()` called on it throws:
//   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
// — which was the exact client-side exception crashing this page.
//
// Moving all of this into a single provider mounted once in app/layout.tsx
// means there's exactly one auth fetch, one profile fetch, and one realtime
// channel per session, no matter how many components consume useAuth().
export function AuthProvider({ children }: { children: ReactNode }) {
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
      const { data: p, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) console.error("Failed to load profile:", error.message);
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
    // needs to run once per mount — and this provider itself only mounts
    // once, at the root.
  }, []);

  // Keep `profile` live: an admin can change someone's tier/staff/admin
  // flags from a different browser while this user is mid-session, and
  // pages that gate on `profile` (creator layout, admin dashboard) need to
  // react immediately rather than waiting for the next navigation, which is
  // the only time middleware re-checks.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-live-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          setProfile((prev) => ({ ...(prev ?? ({} as Profile)), ...(payload.new as Partial<Profile>) }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return <AuthContext.Provider value={{ user, profile, loading }}>{children}</AuthContext.Provider>;
}

// Same signature as before — every existing `const { user, profile } =
// useAuth();` call site keeps working with no changes needed beyond the
// AuthProvider now wrapping the app in app/layout.tsx.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within an <AuthProvider> (see app/layout.tsx)");
  }
  return ctx;
}
