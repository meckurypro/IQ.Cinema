"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/shared/PullToRefresh";

// Home's data comes from the server component itself (app/page.tsx), so
// "refresh" here means re-running that server render, not a client-side
// fetch. useTransition's isPending tracks exactly the span from
// router.refresh() to the new payload being committed — that's what the
// pull-to-refresh spinner should track too, rather than a fixed timeout
// that would drift from actual network conditions.
export function HomeRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isPending && resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, [isPending]);

  function refresh() {
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      startTransition(() => router.refresh());
    });
  }

  return <PullToRefresh onRefresh={refresh}>{children}</PullToRefresh>;
}
