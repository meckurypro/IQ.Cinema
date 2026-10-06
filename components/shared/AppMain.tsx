// components/shared/AppMain.tsx

"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";

// Root <main>. Reserves room for the bottom nav everywhere except full-screen
// pages (For You), which hide the nav and fill the whole viewport — padding
// there would leave a scrollable empty strip under the video.
export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullScreen = pathname.startsWith("/for-you");
  // Video pages fill the viewport on desktop too (they have no bottom bar there).
  const immersive = fullScreen || pathname.startsWith("/watch/") || pathname.startsWith("/downloads/play");
  // The bottom tab bar only exists below the `desk` breakpoint, so the
  // reserved room goes with it.
  return <main className={clsx("flex-1", !fullScreen && "pb-20", immersive ? "desk:pb-0" : "desk:pb-10")}>{children}</main>;
}
