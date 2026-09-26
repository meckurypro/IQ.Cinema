"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";

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

      <Image
        src="/IQCinemaIcon.png"
        alt="IQ Cinema"
        width={38}
        height={38}
        className="shrink-0 rounded-full"
        priority
      />
    </header>
  );
}
