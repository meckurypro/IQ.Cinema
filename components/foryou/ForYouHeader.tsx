// components/foryou/ForYouHeader.tsx

"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import clsx from "clsx";

// Mirrors the reference app's "For you / Collections / All dramas" strip.
// Rather than build two new browse surfaces, this points at the closest
// existing page for each: Collections -> My List, All dramas -> Home's
// Popular/New/Ranking browse. For You itself needs no destination — it's
// this page.
const tabs = [
  { key: "for-you", label: "For you", href: "/for-you" },
  { key: "collections", label: "Collections", href: "/library" },
  { key: "all", label: "All dramas", href: "/" },
] as const;

export function ForYouHeader() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-5 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      {tabs.map(({ key, label, href }) => (
        <Link
          key={key}
          href={href}
          className={clsx(
            "pointer-events-auto text-[16px] font-extrabold tracking-wide transition-colors",
            key === "for-you" ? "text-white" : "text-white/60"
          )}
        >
          {label}
        </Link>
      ))}
      <Link
        href="/search"
        aria-label="Search"
        className="pointer-events-auto ml-auto flex h-8 w-8 items-center justify-center text-white"
      >
        <Search size={19} />
      </Link>
    </div>
  );
}
