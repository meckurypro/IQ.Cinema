// app/auth/login/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth_callback_failed"
      ? "auth_callback_failed"
      : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(translateAuthError(error.message, t));
      return;
    }

    // Only ever redirect within the app — an absolute or protocol-relative
    // `next` value would be an open redirect.
    const rawNext = searchParams.get("next");
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">{t("auth.welcomeBack")}</h1>
      <p className="mt-1.5 text-sm text-muted">{t("auth.signInToKeepWatching")}</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <input
          type="email"
          required
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
        />
        <PasswordInput
          required
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-[13px] font-medium text-muted underline underline-offset-4"
          >
            {t("auth.forgotPassword")}
          </Link>
        </div>
        {error && (
          <p className="text-[13px] text-crimson">
            {error === "auth_callback_failed" ? t("auth.linkInvalid") : error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.newHere")}{" "}
        <Link href="/auth/signup" className="font-medium text-text underline underline-offset-4">
          {t("auth.createAnAccount")}
        </Link>
      </p>
    </div>
  );
}
