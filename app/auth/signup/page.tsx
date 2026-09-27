// app/auth/signup/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function SignupPage() {
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
      setError(signUpError.message);
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
        <h1 className="font-display text-3xl font-semibold text-text">Check your email</h1>
        <p className="mt-1.5 text-sm text-muted">
          We sent a confirmation link to <span className="font-medium text-text">{email}</span>.
          Click it to finish creating your account.
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
            {resent ? "Sent!" : resending ? "Resending…" : "Resend email"}
          </Button>
          <p className="text-center text-sm text-muted">
            <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">Join IQ Cinema — free to watch, free to sign up.</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <input
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
        />
        <PasswordInput
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-crimson">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
