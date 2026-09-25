"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";

export function HomeHeader() {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    if (typeof q === "string" && q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  return (
    <header className="flex items-center gap-2 px-4 pt-5">
      <form onSubmit={handleSubmit} className="flex-1">
        <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            name="q"
            type="text"
            placeholder="Search titles..."
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
        </label>
      </form>

      <Link
        href="/wallet"
        className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-gold/40 bg-gold-soft px-3 text-xs font-semibold text-gold"
      >
        <Sparkles size={13} className="fill-gold" />
        VIP
      </Link>
    </header>
  );
}
