// app/auth/forgot-password/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(translateAuthError(resetError.message, t));
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">{t("auth.resetYourPassword")}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {sent
          ? t("auth.checkInbox")
          : t("auth.enterEmailForReset")}
      </p>

      {!sent ? (
        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          <input
            type="email"
            required
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
          />
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("auth.sending") : t("auth.sendResetLink")}
          </Button>
        </form>
      ) : (
        <div className="mt-7 rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text">
          {t("auth.sentToPrefix")} <span className="font-medium">{email}</span>. {t("auth.didntGetIt")}{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium underline underline-offset-4"
          >
            {t("auth.tryAgain")}
          </button>
          .
        </div>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
