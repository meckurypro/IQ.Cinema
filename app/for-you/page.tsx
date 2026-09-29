// app/for-you/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { ForYouFeed } from "@/components/foryou/ForYouFeed";

// useSearchParams (for the "similar title" deep link into the feed) needs a
// Suspense boundary at the page level; ForYouFeed itself owns everything
// else — no separate shell to keep in sync with it.
export default function ForYouPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-5rem)] bg-black" />}>
      <ForYouFeed />
    </Suspense>
  );
}
