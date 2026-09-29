// app/profile/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Wallet,
  LogOut,
  Film,
  Camera,
  Download,
  Gem,
  Ticket,
  Gift,
  Globe,
  HelpCircle,
  Settings,
  Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Skeleton } from "@/components/ui/Skeleton";

type HistoryItem = {
  poster_url: string | null;
  title: string;
  slug: string;
  episode_number: number;
  total_episodes: number;
};

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const { wallet } = useWallet(user?.id);
  const router = useRouter();
  const supabase = createClient();
  const [showBecomeCreator, setShowBecomeCreator] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isVip, setIsVip] = useState(false);
  const [couponCount, setCouponCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem | null>(null);

  useEffect(() => {
    if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
  }, [profile?.avatar_url]);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_membership").then(({ data }) => setIsVip(Boolean(data?.active)));
    supabase
      .from("user_coupons")
      .select("id", { count: "exact", head: true })
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .then(({ count }) => setCouponCount(count ?? 0));
    supabase
      .from("watch_history")
      .select("episode_id, updated_at, titles(title, slug, poster_url, id)")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        const t = data.titles as unknown as { title: string; slug: string; poster_url: string | null; id: string };
        const [{ data: ep }, { count: total }] = await Promise.all([
          supabase.from("episodes").select("episode_number").eq("id", data.episode_id).maybeSingle(),
          supabase
            .from("episodes")
            .select("id", { count: "exact", head: true })
            .eq("title_id", t.id)
            .eq("status", "published")
            .gt("episode_number", 0),
        ]);
        setHistory({
          poster_url: t.poster_url,
          title: t.title,
          slug: t.slug,
          episode_number: ep?.episode_number ?? 1,
          total_episodes: total ?? 1,
        });
      });
  }, [user, supabase]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    setAvatarError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Use a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    setAvatarUploading(true);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setAvatarError(uploadError.message);
      setAvatarUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);

    setAvatarUrl(publicUrl);
    setAvatarUploading(false);
  }

  useEffect(() => {
    let mounted = true;
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "become_creator_link")
      .single()
      .then(({ data }) => {
        if (mounted && data) setShowBecomeCreator(data.enabled);
      });
    return () => {
      mounted = false;
    };
  }, [supabase]);

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
  const hideCreatorLink = profile?.creator_status === "none" && !showBecomeCreator;

  return (
    <div className="fade-in px-4 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Change profile photo"
              className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-raised font-display text-lg font-semibold text-text disabled:opacity-70"
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill sizes="56px" className="object-cover" />
              ) : (
                (profile?.display_name ?? "U")[0]?.toUpperCase()
              )}
            </button>
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pink text-white ring-2 ring-bg">
              <Camera size={11} />
            </span>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="text-[16px] font-semibold text-text">{profile?.display_name ?? "—"}</p>
            <p className="text-[13px] text-muted">@{profile?.username}</p>
            {avatarUploading && <p className="mt-0.5 text-[11px] text-muted">Uploading…</p>}
            {avatarError && <p className="mt-0.5 text-[11px] text-crimson">{avatarError}</p>}
          </div>
        </div>
        <NotificationBell />
      </div>

      {!isVip && (
        <Link
          href="/wallet"
          className="mt-5 block rounded-lg border border-gold bg-gradient-to-br from-gold-soft to-surface p-4 transition-transform active:scale-[0.99]"
        >
          <p className="flex items-center gap-1.5 text-[14.5px] font-semibold text-text">
            <Crown size={16} className="text-gold" /> Enjoy All Exclusive Perks as a VIP
          </p>
          <div className="mt-2.5 flex items-center gap-4 text-[11.5px] text-muted">
            <span>🔓 2000+ Eps for Free</span>
            <span>🚫 Ad-free</span>
            <span>⬇️ Downloads</span>
          </div>
          <span className="mt-3 flex h-9 items-center justify-center rounded-md bg-gold text-[13.5px] font-semibold text-[rgb(20_16_8)]">
            Activate →
          </span>
        </Link>
      )}

      <div className="mt-4 flex items-stretch rounded-lg border border-border bg-surface p-3.5">
        <Link href="/wallet" className="flex flex-1 flex-col items-center gap-1">
          <Wallet size={16} className="text-gold" />
          <span className="font-display text-[16px] font-semibold tabular-nums text-text">
            {wallet ? wallet.coin_balance.toLocaleString() : "—"}
          </span>
          <span className="text-[11px] text-muted">Wallet</span>
        </Link>
        <div className="w-px bg-border" />
        <Link href="/points" className="flex flex-1 flex-col items-center gap-1">
          <Gem size={16} className="text-pink" />
          <span className="font-display text-[16px] font-semibold tabular-nums text-text">
            {wallet ? wallet.points_balance.toLocaleString() : "—"}
          </span>
          <span className="text-[11px] text-muted">Points</span>
        </Link>
        <div className="w-px bg-border" />
        <Link href="/tickets" className="flex flex-1 flex-col items-center gap-1">
          <Ticket size={16} className="text-crimson" />
          <span className="font-display text-[16px] font-semibold tabular-nums text-text">
            {couponCount}
          </span>
          <span className="text-[11px] text-muted">Coupons</span>
        </Link>
      </div>

      {history && (
        <Link
          href={`/title/${history.slug}`}
          className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-raised">
            {history.poster_url && (
              <Image src={history.poster_url} alt="" fill sizes="44px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-text">{history.title}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              EP.{history.episode_number}/EP.{history.total_episodes || history.episode_number}
            </p>
          </div>
        </Link>
      )}

      <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
        <span className="text-[14px] text-text">Appearance</span>
        <ThemeToggle />
      </div>

      <nav className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        <Link href="/wallet" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Wallet size={17} className="text-muted" /> Top Up
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link href="/rewards" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Gift size={17} className="text-muted" /> Earn Rewards
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link href="/tickets" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Ticket size={17} className="text-muted" /> My Ticket Collection
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link href="/downloads" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Download size={17} className="text-muted" /> My Download
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        {!hideCreatorLink && (
          <Link href={creator.href} className="flex items-center justify-between px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-[14px] text-text">
              <Film size={17} className="text-muted" /> {creator.label}
            </span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        )}
      </nav>

      <nav className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        <Link href="/settings" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Settings size={17} className="text-muted" /> Settings
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <Link href="/settings#language" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Globe size={17} className="text-muted" /> Language
          </span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
        <a
          href="mailto:support@iqcinema.app"
          className="flex items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <HelpCircle size={17} className="text-muted" /> Help & Feedback
          </span>
          <ChevronRight size={16} className="text-muted" />
        </a>
      </nav>

      <Button
        onClick={handleSignOut}
        variant="secondary"
        size="lg"
        className="mt-5 w-full text-crimson"
      >
        <LogOut size={16} /> Sign out
      </Button>
      <div className="h-6" />
    </div>
  );
}
