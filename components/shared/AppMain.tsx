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
  return <main className={clsx("flex-1", !fullScreen && "pb-20")}>{children}</main>;
}
