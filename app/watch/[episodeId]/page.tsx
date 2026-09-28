// app/watch/[episodeId]/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import { EpisodeFeed } from "@/components/watch/EpisodeFeed";

// This route just seeds the feed with the deep-linked episode id. Once
// mounted, EpisodeFeed owns navigation between episodes itself (vertical
// scroll updates the URL via history.replaceState) rather than this page
// re-rendering on every swipe.
export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  if (!episodeId) return null;
  return <EpisodeFeed key={episodeId} initialEpisodeId={episodeId} />;
}
