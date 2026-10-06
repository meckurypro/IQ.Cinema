// app/title/[id]/page.tsx

import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TitleActions } from "@/components/title/TitleActions";
import { TitleMeta } from "@/components/title/TitleMeta";
import { UUID_RE, stripLegacySlugSuffix, titlePath } from "@/lib/links";

const TITLE_COLS =
  "id, slug, title, synopsis, poster_url, banner_url, content_type, content_rating, status, total_unique_views, free_episode_count";

// The URL segment is the title's slug (derived from the unique movie title).
// A raw id or an old suffixed slug (still-standing-b34779) still resolves, and
// the page redirects to the clean /title/<slug>.
const findTitle = cache(async (param: string) => {
  const supabase = createClient();
  const bySlug = await supabase.from("titles").select(TITLE_COLS).eq("slug", param).maybeSingle();
  if (bySlug.data) return bySlug.data;
  if (UUID_RE.test(param)) {
    const byId = await supabase.from("titles").select(TITLE_COLS).eq("id", param).maybeSingle();
    if (byId.data) return byId.data;
  }
  const stripped = stripLegacySlugSuffix(param);
  if (stripped) {
    const legacy = await supabase.from("titles").select(TITLE_COLS).eq("slug", stripped).maybeSingle();
    if (legacy.data) return legacy.data;
  }
  return null;
});

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const title = await findTitle(params.id);
  if (!title) return {};
  const description = title.synopsis ?? `Watch ${title.title} on IQ Cinema.`;
  const image = title.banner_url ?? title.poster_url;
  return {
    title: `${title.title} | IQ Cinema`,
    description,
    openGraph: {
      title: title.title,
      description,
      siteName: "IQ Cinema",
      type: "video.tv_show",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: title.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

async function getTitle(param: string) {
  const supabase = createClient();
  const title = await findTitle(param);
  if (!title) return null;

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, name, unlock_cost_coins")
    .eq("title_id", title.id)
    .eq("status", "published")
    .gt("episode_number", 0)
    .order("episode_number", { ascending: true });

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("default_free_episodes, default_episode_unlock_coins")
    .single();

  return { title, episodes: episodes ?? [], settings };
}

export default async function TitlePage({ params }: { params: { id: string } }) {
  const data = await getTitle(params.id);
  if (!data) notFound();
  if (data.title.slug !== params.id) permanentRedirect(titlePath(data.title.slug));

  const { title, episodes, settings } = data;
  const freeCount = title.free_episode_count ?? settings?.default_free_episodes ?? 4;
  const defaultCost = settings?.default_episode_unlock_coins ?? 30;

  return (
    <div className="fade-in desk:grid desk:grid-cols-[minmax(0,380px)_1fr] desk:items-start desk:gap-12 desk:pt-8">
      <div className="relative aspect-[9/16] w-full desk:overflow-hidden desk:rounded-xl">
        {title.banner_url || title.poster_url ? (
          <Image
            src={title.banner_url ?? title.poster_url!}
            alt={title.title}
            fill
            priority
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-black/30 desk:from-black/25" />
      </div>

      {/* Sits below the poster, not over it. A negative top margin used to pull
          this block up under the poster's absolutely-positioned layers, which
          paint above non-positioned siblings — that covered the top of the
          title. The poster's own gradient already fades into the page. */}
      <div className="px-4 pb-8 pt-6 desk:px-0 desk:pt-2">
        <h1 className="font-display text-[22px] font-semibold leading-tight text-text desk:text-[36px]">
          {title.title}
        </h1>
        <TitleMeta
          contentRating={title.content_rating}
          status={title.status}
          episodeCount={episodes.length}
        />

        {title.synopsis && (
          <p className="mt-3 text-[14px] leading-relaxed text-text/85 desk:mt-5 desk:max-w-2xl desk:text-[16px]">{title.synopsis}</p>
        )}

        <div className="desk:max-w-xl">
        <TitleActions
          titleId={title.id}
          slug={title.slug}
          status={title.status}
          episodes={episodes}
          freeCount={freeCount}
          defaultCost={defaultCost}
        />
        </div>
      </div>
    </div>
  );
}
