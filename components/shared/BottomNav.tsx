// components/shared/BottomNav.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  HomeIcon,
  ForYouIcon,
  MyListIcon,
  RewardsIcon,
  ProfileIcon,
} from "./NavIcons";

const items = [
  { href: "/", label: "nav.home", icon: HomeIcon },
  { href: "/for-you", label: "nav.forYou", icon: ForYouIcon },
  { href: "/library", label: "nav.myList", icon: MyListIcon },
  { href: "/rewards", label: "nav.rewards", icon: RewardsIcon },
  { href: "/profile", label: "nav.profile", icon: ProfileIcon },
] as const satisfies readonly { href: string; label: MessageKey; icon: unknown }[];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const hideOn = ["/watch/", "/auth/", "/downloads/play", "/for-you"];
  if (hideOn.some((p) => pathname.startsWith(p))) return null;

  const activeIndex = items.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t desk:hidden border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="relative flex items-stretch justify-between px-1">
        {items.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;

          return (
            <li key={href} className="relative flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-0.5 rounded-md py-2 text-[11.5px] transition-colors"
              >
                <span key={active ? `${href}-active` : href} className={clsx(active && "coin-pop")}>
                  <Icon
                    width={28}
                    height={28}
                    className={clsx("transition-colors", active ? "text-pink" : "text-muted")}
                  />
                </span>
                <span
                  className={clsx(
                    "font-bold tracking-tight transition-colors",
                    active ? "text-pink" : "text-muted"
                  )}
                >
                  {t(label)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
