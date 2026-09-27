// app/auth/reset-password/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // A valid recovery session only exists if the person actually arrived via
  // a real (unexpired, unused) reset link that /auth/callback just exchanged.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[14px] text-muted">
        Checking your link…
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
        <h1 className="font-display text-3xl font-semibold text-text">Link expired</h1>
        <p className="mt-1.5 text-sm text-muted">
          This password reset link is invalid or has expired. Request a new one to continue.
        </p>
        <Link href="/auth/forgot-password" className="mt-7 block">
          <Button className="w-full" size="lg">
            Request a new link
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">Set a new password</h1>
      <p className="mt-1.5 text-sm text-muted">Choose something you haven't used before.</p>

      {done ? (
        <div className="mt-7 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-[14px] text-emerald-500">
          Password updated — signing you in…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          <PasswordInput
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </div>
  );
}
