// app/creator/layout.tsx

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// middleware.ts gates these same paths, but only at navigation time. Once a
// page is mounted, nothing re-checks it -- so if an admin demotes someone in
// another tab, the open page just keeps working until the user happens to
// navigate again. useAuth's profile is now live (Supabase Realtime), so this
// re-runs the same rules reactively and evicts the moment access changes.
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !profile) return; // logged-out is middleware's job; wait for profile to load before judging it

    if (pathname === "/creator/apply") return; // open to any signed-in user, no tier required

    const isCreatorOrAdmin = profile.role === "creator" || profile.is_admin;

    if (pathname === "/creator/withdraw") {
      // Losing just the partner tier (still a creator) drops them back to
      // the dashboard, same as middleware -- they haven't lost creator
      // access, only the withdraw capability.
      const isPartnerOrAdmin = profile.is_admin || profile.creator_status === "partner";
      if (!isPartnerOrAdmin) router.replace("/creator/dashboard");
      return;
    }

    // Losing creator access entirely (demoted to viewer) is a bigger change
    // than "go reapply" -- send them to their profile page, not back into
    // the apply flow.
    if (!isCreatorOrAdmin) router.replace("/profile");
  }, [loading, user, profile, pathname, router]);

  return <>{children}</>;
}
