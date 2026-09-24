"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

export default function CreatorApplyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [bio, setBio] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from("creator_applications").insert({
      user_id: user.id,
      bio,
      portfolio_url: portfolioUrl || null,
      primary_genre: primaryGenre || null,
      sample_url: sampleUrl || null,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    await supabase.from("profiles").update({ creator_status: "applied" }).eq("id", user.id);
    setSubmitting(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center fade-in">
        <p className="font-display text-xl font-semibold text-text">Application sent</p>
        <p className="mt-2 text-sm text-muted">
          We'll review your application and let you know. This usually takes a few days.
        </p>
        <Link href="/profile" className="mt-5">
          <Button variant="secondary">Back to profile</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-xl font-semibold text-text">Become a creator</h1>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Tell us about what you make. Approved creators can upload titles; earnings unlock fully
        once you reach Partner Program milestones.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <textarea
          required
          placeholder="Tell us about your work"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text placeholder:text-muted"
        />
        <input
          placeholder="Primary genre"
          value={primaryGenre}
          onChange={(e) => setPrimaryGenre(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        <input
          placeholder="Portfolio link (optional)"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        <input
          placeholder="Sample content link"
          value={sampleUrl}
          onChange={(e) => setSampleUrl(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
        />
        {error && <p className="text-[13px] text-crimson">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit application"}
        </Button>
      </form>
    </div>
  );
}
