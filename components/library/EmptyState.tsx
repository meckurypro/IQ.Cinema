// components/library/EmptyState.tsx

import Link from "next/link";
import { Button } from "@/components/ui/Button";

function Cup() {
  return (
    <svg viewBox="0 0 160 130" fill="none" aria-hidden className="h-32 w-40 text-muted">
      <path d="M62 30c-5-7 4-11-1-18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
      <path d="M80 27c-5-8 4-12-1-21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
      <ellipse cx="80" cy="100" rx="54" ry="15" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="80" cy="100" rx="38" ry="9" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      <path d="M40 50c0 27 16 46 40 46s40-19 40-46" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="80" cy="50" rx="40" ry="11" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="80" cy="51" rx="30" ry="7" fill="rgb(var(--pink) / 0.4)" />
      <path d="M119 56c13-2 19 5 14 13-3 6-11 8-19 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="72" r="5" fill="rgb(var(--pink) / 0.35)" />
      <circle cx="140" cy="38" r="6" fill="rgb(var(--gold) / 0.55)" />
      <circle cx="132" cy="92" r="2.5" fill="rgb(var(--pink) / 0.5)" />
    </svg>
  );
}

export function EmptyState({
  message = "Go to the homepage to discover more content.",
  actionLabel = "Discover More",
  href = "/",
}: {
  message?: string;
  actionLabel?: string;
  href?: string;
}) {
  return (
    <div className="fade-in flex flex-col items-center px-8 pt-16 text-center">
      <Cup />
      <p className="mt-6 max-w-[16rem] text-[17px] leading-snug text-muted">{message}</p>
      <Link href={href} className="mt-6">
        <Button size="lg" className="min-w-[13rem]">
          {actionLabel}
        </Button>
      </Link>
    </div>
  );
}
