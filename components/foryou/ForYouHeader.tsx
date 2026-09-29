// components/foryou/ForYouHeader.tsx

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import clsx from "clsx";

// Mirrors the reference app's "For you / Collections / All movies" strip.
// Rather than build two new browse surfaces, this points at the closest
// existing page for each: Collections -> My List, All movies -> Home's
// Popular/New/Ranking browse. For You itself needs no destination — it's
// this page, and stays the one with the underline under it.
const tabs = [
  { key: "for-you", label: "For you", href: "/for-you" },
  { key: "collections", label: "Collections", href: "/library" },
  { key: "all", label: "All", href: "/" },
] as const;

export function ForYouHeader() {
  // Same measured-underline treatment as Home (CategoryTabs) and My List
  // (LibraryTabs) — "For you" is always the active tab here, but measuring
  // its box rather than hard-coding a pixel offset keeps it lined up if the
  // label or font ever changes.
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [center, setCenter] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current["for-you"];
      if (el) setCenter(el.offsetLeft + el.offsetWidth / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-5 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-3"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      {tabs.map(({ key, label, href }) => (
        <Link
          key={key}
          ref={(el) => {
            refs.current[key] = el;
          }}
          href={href}
          className={clsx(
            "pointer-events-auto text-[16px] font-extrabold uppercase tracking-wide transition-colors",
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
      {center !== null && (
        <span
          aria-hidden
          className="absolute bottom-0 h-[3px] w-7 -translate-x-1/2 rounded-full bg-pink transition-[left] duration-300 ease-out"
          style={{ left: center }}
        />
      )}
    </div>
  );
}
