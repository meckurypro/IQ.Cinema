"use client";

import { createBrowserClient } from "@supabase/ssr";

// One client per browser tab, not one per call. Every "use client" component
// and hook in this app calls createClient() on every render (several of them
// straight in the component body, outside any effect). A fresh
// createBrowserClient() each time is a needless a real allocation, and worse,
// when the returned client is used inside a hook/effect dependency array
// (useAuth, useWallet, the library/creator-dashboard effects) a new object
// identity on every render means the dependency "changes" every render, so
// the effect tears down and re-fires in a loop — repeated
// auth/profile/wallet network round trips on every render, which is what
// made tab switches feel slow. Returning the same instance keeps identity
// stable across renders and fixes both problems at once.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
