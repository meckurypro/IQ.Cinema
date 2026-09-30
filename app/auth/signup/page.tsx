// app/auth/signup/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function SignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once signUp() succeeds but there's no session yet — i.e. email
  // confirmation is required and the account isn't usable until they click
  // the link. Previously the page just redirected to "/" regardless, which
  // looked like a working signup even when the account wasn't confirmed.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(translateAuthError(signUpError.message, t));
      return;
    }

    // profiles row is created automatically by a DB trigger on auth.users —
    // no client-side insert needed (and RLS wouldn't allow one anyway).

    if (data.session) {
      // Email confirmation is off, or this project auto-confirms — already signed in.
      router.push("/");
      router.refresh();
      return;
    }

    setAwaitingConfirmation(true);
  }

  async function handleResend() {
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    if (!resendError) setResent(true);
  }

  if (awaitingConfirmation) {
    return (
      <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
        <h1 className="font-display text-3xl font-semibold text-text">{t("auth.checkYourEmail")}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("auth.confirmationSent", { email })}
        </p>
        <div className="mt-7 space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            disabled={resending || resent}
            onClick={handleResend}
          >
            {resent ? t("auth.sent") : resending ? t("auth.resending") : t("auth.resendEmail")}
          </Button>
          <p className="text-center text-sm text-muted">
            <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
              {t("auth.backToSignIn")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">{t("auth.createYourAccount")}</h1>
      <p className="mt-1.5 text-sm text-muted">{t("auth.joinTagline")}</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <input
          required
          placeholder={t("auth.username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
        />
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
          minLength={6}
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-crimson">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}
