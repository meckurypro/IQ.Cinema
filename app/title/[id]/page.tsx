import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Play, Bookmark, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

async function getTitle(slug: string) {
  const supabase = createClient();

  const { data: title } = await supabase
    .from("titles")
    .select(
      "id, slug, title, synopsis, poster_url, banner_url, content_type, content_rating, total_unique_views, free_episode_count, creator_id, profiles!titles_creator_id_fkey(display_name, username)"
    )
    .eq("slug", slug)
    .single();

  if (!title) return null;

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, name, duration_seconds, unlock_cost_coins, status")
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
  const creator = Array.isArray(title.profiles) ? title.profiles[0] : title.profiles;

  return (
    <div className="fade-in">
      <div className="relative aspect-[3/4] w-full">
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

      <div className="-mt-8 rounded-t-xl bg-bg px-4 pb-4 pt-5">
        <h1 className="font-display text-[22px] font-semibold leading-tight text-text">
          {title.title}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {title.content_rating} · {episodes.length} episodes
          {creator?.display_name ? ` · by ${creator.display_name}` : ""}
        </p>

        {title.synopsis && (
          <p className="mt-3 text-[14px] leading-relaxed text-text/85">{title.synopsis}</p>
        )}

        <div className="mt-4 flex gap-2">
          <Link
            href={episodes[0] ? `/watch/${episodes[0].id}` : "#"}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-crimson text-[15px] font-semibold text-white"
          >
            <Play size={16} className="fill-white" />
            Watch now
          </Link>
          <button
            aria-label="Add to library"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-text"
          >
            <Bookmark size={17} />
          </button>
        </div>
      </div>

      <div className="px-4">
        <h2 className="font-display mb-2 text-[17px] font-semibold text-text">Episodes</h2>
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {episodes.map((ep) => {
            const isFree = ep.episode_number <= freeCount;
            const cost = ep.unlock_cost_coins ?? settings?.default_episode_unlock_coins ?? 30;

            return (
              <li key={ep.id}>
                <Link
                  href={`/watch/${ep.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-text">
                      EP {ep.episode_number}
                      {ep.name ? ` · ${ep.name}` : ""}
                    </p>
                    {ep.duration_seconds && (
                      <p className="text-[12px] text-muted">
                        {Math.round(ep.duration_seconds / 60)} min
                      </p>
                    )}
                  </div>

                  {isFree ? (
                    <span className="shrink-0 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-muted">
                      Free
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-gold">
                      <Lock size={11} />
                      <Zap size={11} className="fill-gold" />
                      {cost}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}

          {!episodes.length && (
            <li className="px-4 py-6 text-center text-sm text-muted">
              No episodes published yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
