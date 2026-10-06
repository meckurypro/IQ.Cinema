// components/shared/SideNav.tsx
//
// Desktop navigation. Replaces the bottom tab bar on screens that match the
// `desk` breakpoint (see tailwind.config.ts): an icon rail on mid-size
// windows, and an expanded rail with labels from `xl` up. Same destinations
// as BottomNav, plus the secondary pages that phones reach through Profile.

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Bell, Clapperboard, Download, Search, Settings, ShieldCheck, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { ThemeToggle } from "./ThemeToggle";
import { HomeIcon, ForYouIcon, MyListIcon, RewardsIcon, ProfileIcon } from "./NavIcons";

type NavItem = {
  href: string;
  label: MessageKey;
  icon: React.ComponentType<{ width?: number | string; height?: number | string; className?: string }>;
};

const primary: NavItem[] = [
  { href: "/", label: "nav.home", icon: HomeIcon },
  { href: "/for-you", label: "nav.forYou", icon: ForYouIcon },
  { href: "/library", label: "nav.myList", icon: MyListIcon },
  { href: "/rewards", label: "nav.rewards", icon: RewardsIcon },
  { href: "/profile", label: "nav.profile", icon: ProfileIcon },
];

const secondary: NavItem[] = [
  { href: "/wallet", label: "profile.wallet", icon: Zap },
  { href: "/downloads", label: "profile.downloads", icon: Download },
  { href: "/notifications", label: "notifications.title", icon: Bell },
  { href: "/settings", label: "profile.settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, label }: { item: NavItem; pathname: string; label: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        "justify-center xl:justify-start",
        active ? "bg-pink/10 text-pink" : "text-muted hover:bg-surface-raised hover:text-text"
      )}
    >
      <Icon width={24} height={24} className="shrink-0" />
      <span className="hidden text-[15px] font-bold tracking-tight xl:inline">{label}</span>
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, profile } = useAuth();

  const isCreator = profile?.role === "creator" || profile?.is_admin;
  const extras: NavItem[] = [
    ...(isCreator ? [{ href: "/creator/dashboard", label: "profile.creatorDashboard" as MessageKey, icon: Clapperboard }] : []),
    ...(profile?.is_admin ? [{ href: "/admin", label: "nav.admin" as MessageKey, icon: ShieldCheck }] : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-border bg-surface desk:flex xl:w-60">
      <Link href="/" className="flex items-center justify-center gap-2.5 px-3 pb-3 pt-5 xl:justify-start xl:px-5" aria-label="IQ Cinema">
        <Image src="/IQCinemaIcon.png" alt="" width={36} height={36} className="shrink-0" priority />
        <span className="font-display hidden text-[20px] font-semibold text-text xl:inline">IQ Cinema</span>
      </Link>

      <nav aria-label={t("nav.primary")} className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3 xl:px-3">
        <Link
          href="/search"
          title={t("common.search")}
          className={clsx(
            "mb-2 flex items-center gap-2.5 rounded-full border border-border bg-surface-raised px-3 py-2.5 text-muted transition-colors hover:text-text",
            "justify-center xl:justify-start",
            pathname.startsWith("/search") && "border-pink/50 text-pink"
          )}
        >
          <Search size={18} className="shrink-0" />
          <span className="hidden text-[14px] xl:inline">{t("common.search")}</span>
        </Link>

        {primary.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} label={t(item.label)} />
        ))}

        <div className="my-2 border-t border-border" />

        {[...secondary, ...extras].map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} label={t(item.label)} />
        ))}
      </nav>

      <div className="flex flex-col items-center gap-3 border-t border-border px-2 py-3 xl:items-stretch xl:px-4">
        {!user && (
          <Link
            href="/auth/login"
            className="flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-pink to-crimson px-3 text-[13px] font-semibold text-white xl:text-[14px]"
          >
            {t("profile.signIn")}
          </Link>
        )}
        <div className="hidden xl:block">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
