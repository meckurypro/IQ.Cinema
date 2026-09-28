// app/profile/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Wallet, Bell, LogOut, Film, Camera, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/Button";

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [showBecomeCreator, setShowBecomeCreator] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // profile loads asynchronously after useAuth's own fetch — pick up its
  // avatar_url once available instead of only reading it at mount time.
  useEffect(() => {
    if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
  }, [profile?.avatar_url]);

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
    // Fixed filename per user (not the original name) — upsert overwrites
    // the same object on every change instead of accumulating orphans.
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
    // Cache-bust: the path is stable across uploads, so without this the
    // browser (and any CDN) would keep serving the previous image.
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
        // Flag missing or unreadable defaults to visible, so a table hiccup
        // never silently hides the link from every user.
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
  // Only the initial invite is admin-hideable — a user who already applied,
  // was declined, or is an active creator/partner still needs their own
  // status link and dashboard, regardless of the flag.
  const hideCreatorLink = profile?.creator_status === "none" && !showBecomeCreator;

  return (
    <div className="fade-in px-4 pt-5">
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
          <p className="text-[16px] font-semibold text-text">
            {profile?.display_name ?? "—"}
          </p>
          <p className="text-[13px] text-muted">@{profile?.username}</p>
          {avatarUploading && <p className="mt-0.5 text-[11px] text-muted">Uploading…</p>}
          {avatarError && <p className="mt-0.5 text-[11px] text-crimson">{avatarError}</p>}
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
        <Link href="/downloads" className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Download size={17} className="text-muted" /> Downloads
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
        <button className="flex w-full items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-[14px] text-text">
            <Bell size={17} className="text-muted" /> Notifications
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
      </nav>

      <Button
        onClick={handleSignOut}
        variant="secondary"
        size="lg"
        className="mt-5 w-full text-crimson"
      >
        <LogOut size={16} /> Sign out
      </Button>
    </div>
  );
}
