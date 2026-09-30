// app/auth/reset-password/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function ResetPasswordPage() {
  const { t } = useI18n();
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
      setError(t("auth.passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsDontMatch"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(translateAuthError(updateError.message, t));
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
        {t("auth.checkingLink")}
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
        <h1 className="font-display text-3xl font-semibold text-text">{t("auth.linkExpired")}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("auth.linkExpiredBody")}
        </p>
        <Link href="/auth/forgot-password" className="mt-7 block">
          <Button className="w-full" size="lg">
            {t("auth.requestNewLink")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">{t("auth.setNewPassword")}</h1>
      <p className="mt-1.5 text-sm text-muted">{t("auth.chooseNew")}</p>

      {done ? (
        <div className="mt-7 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-[14px] text-emerald-500">
          {t("auth.passwordUpdated")}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          <PasswordInput
            required
            minLength={6}
            placeholder={t("auth.newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            required
            minLength={6}
            placeholder={t("auth.confirmNewPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("auth.updating") : t("auth.updatePassword")}
          </Button>
        </form>
      )}
    </div>
  );
}
