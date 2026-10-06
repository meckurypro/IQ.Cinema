// components/shared/AppShell.tsx
//
// One responsive shell for every page.
//   • Phones (and landscape phones): the original layout — a phone-width
//     column with the bottom tab bar. Nothing changes there.
//   • `desk` screens: a left sidebar, with the page content centred in a
//     width suited to what it shows (wide catalogue grids, a medium column
//     for forms/lists, or an edge-to-edge black stage for the video feeds).

"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { AppMain } from "./AppMain";

// Full-bleed video pages: black stage, the feed draws its own centred column.
const IMMERSIVE = ["/for-you", "/watch/", "/downloads/play"];
// Pages with no app chrome at all (centred card on desktop).
const BARE = ["/auth/"];
// Catalogue / dashboard pages that benefit from the full content width.
const WIDE = ["/", "/library", "/search", "/downloads", "/admin", "/title/"];

export type ShellMode = "immersive" | "bare" | "wide" | "medium";

export function shellMode(pathname: string): ShellMode {
  if (IMMERSIVE.some((p) => pathname.startsWith(p))) return "immersive";
  if (BARE.some((p) => pathname.startsWith(p))) return "bare";
  if (WIDE.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))) return "wide";
  return "medium";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = shellMode(pathname);
  const showSide = mode !== "bare";

  return (
    <>
      {showSide && <SideNav />}
      <div
        className={clsx(
          "mx-auto flex min-h-dvh max-w-md flex-col bg-bg",
          // On desktop the phone-width cap is lifted and room is made for the sidebar.
          "desk:max-w-none",
          showSide && "desk:pl-[72px] xl:pl-60",
          mode === "immersive" && "desk:bg-black"
        )}
      >
        <div
          className={clsx(
            "flex w-full flex-1 flex-col",
            mode === "wide" && "desk:mx-auto desk:max-w-7xl desk:px-6 xl:px-10",
            mode === "medium" && "desk:mx-auto desk:max-w-4xl desk:px-6",
            mode === "bare" && "desk:mx-auto desk:max-w-md desk:justify-center"
          )}
        >
          <AppMain>{children}</AppMain>
        </div>
        {showSide && <BottomNav />}
      </div>
    </>
  );
}
