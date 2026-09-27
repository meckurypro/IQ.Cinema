// app/auth/forgot-password/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
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
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 fade-in">
      <h1 className="font-display text-3xl font-semibold text-text">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted">
        {sent
          ? "Check your inbox for a reset link."
          : "Enter the email on your account and we'll send you a reset link."}
      </p>

      {!sent ? (
        <form onSubmit={handleSubmit} className="mt-7 space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted"
          />
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      ) : (
        <div className="mt-7 rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text">
          Sent to <span className="font-medium">{email}</span>. Didn't get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium underline underline-offset-4"
          >
            try again
          </button>
          .
        </div>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/auth/login" className="font-medium text-text underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
