// app/title/[id]/page.tsx

import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TitleActions } from "@/components/title/TitleActions";
import { formatEpisodeCount } from "@/lib/format";

async function getTitle(slug: string) {
  const supabase = createClient();

  const { data: title } = await supabase
    .from("titles")
    .select(
      "id, slug, title, synopsis, poster_url, banner_url, content_type, content_rating, status, total_unique_views, free_episode_count"
    )
    .eq("slug", slug)
    .single();

  if (!title) return null;

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, name, unlock_cost_coins")
    .eq("title_id", title.id)
    .eq("status", "published")
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

  const { title, episodes, settings } = data;
  const freeCount = title.free_episode_count ?? settings?.default_free_episodes ?? 4;
  const defaultCost = settings?.default_episode_unlock_coins ?? 30;

  return (
    <div className="fade-in">
      <div className="relative aspect-[9/16] w-full">
        {title.banner_url || title.poster_url ? (
          <Image
            src={title.banner_url ?? title.poster_url!}
            alt={title.title}
            fill
            priority
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-black/30" />
      </div>

      {/* Sits below the poster, not over it. A negative top margin used to pull
          this block up under the poster's absolutely-positioned layers, which
          paint above non-positioned siblings — that covered the top of the
          title. The poster's own gradient already fades into the page. */}
      <div className="px-4 pb-8 pt-6">
        <h1 className="font-display text-[22px] font-semibold leading-tight text-text">
          {title.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {title.content_rating} ·{" "}
          {title.status === "coming_soon" ? "Coming soon" : formatEpisodeCount(episodes.length)}
        </p>

        {title.synopsis && (
          <p className="mt-3 text-[14px] leading-relaxed text-text/85">{title.synopsis}</p>
        )}

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
  );
}
