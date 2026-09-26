"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  HomeIcon,
  ForYouIcon,
  MyListIcon,
  RewardsIcon,
  ProfileIcon,
} from "./NavIcons";

const items = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/for-you", label: "For You", icon: ForYouIcon },
  { href: "/library", label: "My List", icon: MyListIcon },
  { href: "/rewards", label: "Rewards", icon: RewardsIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const hideOn = ["/watch/", "/auth/"];
  if (hideOn.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-black/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex items-stretch justify-between px-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isRewards = href === "/rewards";

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 rounded-md py-2.5 text-[11.5px] transition-colors active:bg-pink/10"
              >
                <Icon
                  width={25}
                  height={25}
                  filled={active}
                  className={clsx(
                    "transition-colors",
                    isRewards ? "text-gold" : active ? "text-pink" : "text-white/85"
                  )}
                />
                <span
                  className={clsx(
                    "font-bold tracking-tight transition-colors",
                    isRewards ? "text-gold" : active ? "text-pink" : "text-white/85"
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
