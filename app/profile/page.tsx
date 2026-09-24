"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Wallet, Bell, LogOut, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/Button";

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center fade-in">
        <p className="font-display text-lg text-text">You're browsing as a guest</p>
        <p className="mt-1 text-sm text-muted">Sign in to save your library and buy coins.</p>
        <Link href="/auth/login">
          <Button className="mt-4">Sign in</Button>
        </Link>
      </div>
    );
  }

  const creatorLink = () => {
    switch (profile?.creator_status) {
      case "none":
        return { href: "/creator/apply", label: "Become a creator" };
      case "applied":
        return { href: "/creator/apply", label: "Application pending" };
      case "declined":
        return { href: "/creator/apply", label: "Application declined — reapply" };
      case "approved":
      case "partner":
        return { href: "/creator/dashboard", label: "Creator dashboard" };
      default:
        return { href: "/creator/apply", label: "Become a creator" };
    }
  };
  const creator = creatorLink();

  return (
    <div className="fade-in px-4 pt-5">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised font-display text-lg font-semibold text-text">
          {(profile?.display_name ?? "U")[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-[16px] font-semibold text-text">
            {profile?.display_name ?? "—"}
          </p>
          <p className="text-[13px] text-muted">@{profile?.username}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
        <span className="text-[14px] text-text">Appearance</span>
        <ThemeToggle />
      </div>

      <nav className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        <Link href="/wallet" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Wallet size={17} className="text-muted" /> Wallet & subscriptions
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link href={creator.href} className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Film size={17} className="text-muted" /> {creator.label}
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <button className="flex w-full items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Bell size={17} className="text-muted" /> Notifications
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
      </nav>

      <button
        onClick={handleSignOut}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-border py-3 text-[14px] font-medium text-crimson"
      >
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}
