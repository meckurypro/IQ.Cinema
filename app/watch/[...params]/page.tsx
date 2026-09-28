// app/watch/[...params]/page.tsx
//
// Accepted URLs:
//   /watch/still-standing/ep-2   readable link (what Share produces)
//   /watch/still-standing        title slug alone -> episode 1
//   /watch/<episode-uuid>        older links and in-app links
//
// Resolved on the server so the shared link carries the movie title and
// episode number in its preview (title, description, poster), and so old
// slugs redirect to the canonical one. EpisodeFeed then owns navigation
// between episodes and keeps the address bar in sync as you scroll.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EpisodeFeed } from "@/components/watch/EpisodeFeed";
import { UUID_RE, episodePath, stripLegacySlugSuffix } from "@/lib/links";

export const dynamic = "force-dynamic";

type TitleRow = { id: string; slug: string; title: string; synopsis: string | null; poster_url: string | null };

const TITLE_COLS = "id, slug, title, synopsis, poster_url";

const resolve = cache(async (segments: string[]) => {
  const supabase = createClient();

  // /watch/<uuid>
  if (segments.length === 1 && UUID_RE.test(segments[0])) {
    const { data: ep } = await supabase
      .from("episodes")
      .select("id, episode_number, title_id")
      .eq("id", segments[0])
      .maybeSingle();
    if (!ep) return null;
    const { data: title } = await supabase.from("titles").select(TITLE_COLS).eq("id", ep.title_id).maybeSingle();
    return { episodeId: ep.id as string, episodeNumber: ep.episode_number as number, title: title as TitleRow | null, byId: true };
  }

  if (segments.length > 2) return null;
  const [slugParam, epParam] = segments;

  let episodeNumber = 1;
  if (epParam !== undefined) {
    const m = epParam.match(/^(?:ep-?)?(\d+)$/i);
    if (!m) return null;
    episodeNumber = Number(m[1]);
  }

  let { data: title } = await supabase.from("titles").select(TITLE_COLS).eq("slug", slugParam).maybeSingle();
  if (!title) {
    // Slugs made before titles were unique ended in a random 6-char suffix.
    const stripped = stripLegacySlugSuffix(slugParam);
    if (stripped) {
      ({ data: title } = await supabase.from("titles").select(TITLE_COLS).eq("slug", stripped).maybeSingle());
    }
  }
  if (!title) return null;

  const { data: ep } = await supabase
    .from("episodes")
    .select("id, episode_number")
    .eq("title_id", title.id)
    .eq("episode_number", episodeNumber)
    .eq("status", "published")
    .maybeSingle();
  if (!ep) return null;

  return { episodeId: ep.id as string, episodeNumber, title: title as TitleRow, byId: false };
});

export async function generateMetadata({ params }: { params: { params: string[] } }): Promise<Metadata> {
  const r = await resolve(params.params);
  if (!r?.title) return {};
  const heading = `${r.title.title} · Episode ${r.episodeNumber}`;
  const description = r.title.synopsis ?? `Watch ${r.title.title} on IQ Cinema.`;
  return {
    title: `${heading} | IQ Cinema`,
    description,
    openGraph: {
      title: heading,
      description,
      siteName: "IQ Cinema",
      type: "video.episode",
      images: r.title.poster_url ? [{ url: r.title.poster_url }] : undefined,
    },
    twitter: {
      card: r.title.poster_url ? "summary_large_image" : "summary",
      title: heading,
      description,
      images: r.title.poster_url ? [r.title.poster_url] : undefined,
    },
  };
}

export default async function WatchPage({ params }: { params: { params: string[] } }) {
  const r = await resolve(params.params);
  if (!r) notFound();

  // An old suffixed slug (or a bare title slug) lands on the canonical URL.
  if (!r.byId && r.title) {
    const canonical = episodePath(r.title.slug, r.episodeNumber, r.episodeId);
    const requested = `/watch/${params.params.join("/")}`;
    if (requested !== canonical && params.params.length === 2) permanentRedirect(canonical);
  }

  return <EpisodeFeed key={r.episodeId} initialEpisodeId={r.episodeId} />;
}
