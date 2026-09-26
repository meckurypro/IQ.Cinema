// app/creator/withdraw/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";

export default function WithdrawPage() {
  const { user } = useAuth();
  const { wallet, refresh } = useWallet(user?.id);
  const router = useRouter();
  const supabase = createClient();

  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("request_withdrawal", {
      p_user_id: user.id,
      p_amount_naira: Number(amount),
      p_bank_account_name: bankName,
      p_bank_account_number: accountNumber,
      p_bank_code: bankCode,
    });

    setSubmitting(false);

    if (rpcError || !data?.ok) {
      setError(rpcError?.message || data?.error || "Could not submit withdrawal request");
      return;
    }

    await refresh();
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center fade-in">
        <p className="font-display text-xl font-semibold text-text">Request sent</p>
        <p className="mt-2 text-sm text-muted">
          An admin will review and approve your withdrawal. Payout follows via bank transfer.
        </p>
        <Link href="/creator/dashboard" className="mt-5">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/creator/dashboard" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Request withdrawal</h1>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        Available: ₦{(wallet?.earnings_balance_naira ?? 0).toLocaleString()}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <input
          type="number"
          required
          placeholder="Amount (₦)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        <input
          required
          placeholder="Account name"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        <input
          required
          placeholder="Account number"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        <input
          required
          placeholder="Bank code (Paystack bank code)"
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        {error && <p className="text-[13px] text-crimson">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </div>
  );
}
