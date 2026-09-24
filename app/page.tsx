import Image from "next/image";
import Link from "next/link";
import { Search, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Rail } from "@/components/home/Rail";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export const revalidate = 60;

async function getHomeData() {
  const supabase = createClient();

  const { data: featured } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, banner_url, synopsis, total_unique_views, is_exclusive")
    .eq("status", "published")
    .order("total_unique_views", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: trending } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, total_unique_views, is_exclusive")
    .eq("status", "published")
    .order("total_unique_views", { ascending: false })
    .limit(10);

  const { data: newReleases } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, total_unique_views, is_exclusive")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(10);

  return { featured, trending: trending ?? [], newReleases: newReleases ?? [] };
}

export default async function HomePage() {
  const { featured, trending, newReleases } = await getHomeData();

  return (
    <div className="fade-in">
      <header className="flex items-center justify-between px-4 pt-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
          IQ Cinema
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/wallet"
            className="flex h-9 items-center gap-1 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-text"
          >
            <Zap size={14} className="fill-gold text-gold" />
            —
          </Link>
          <Link
            href="/explore"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text"
          >
            <Search size={16} />
          </Link>
        </div>
      </header>

      {featured && (
        <Link href={`/title/${featured.slug}`} className="mt-5 block px-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-raised">
            {featured.banner_url || featured.poster_url ? (
              <Image
                src={featured.banner_url ?? featured.poster_url!}
                alt={featured.title}
                fill
                sizes="480px"
                priority
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gold">
                Featured
              </p>
              <h2 className="font-display mt-1 text-[26px] font-semibold leading-tight text-white">
                {featured.title}
              </h2>
              {featured.synopsis && (
                <p className="mt-1.5 line-clamp-2 text-[13px] text-white/75">
                  {featured.synopsis}
                </p>
              )}
            </div>
          </div>
        </Link>
      )}

      <Rail heading="Trending now" titles={trending} />
      <Rail heading="New releases" titles={newReleases} />

      {!featured && !trending.length && (
        <div className="mt-16 px-6 text-center">
          <p className="font-display text-lg text-text">Nothing published yet</p>
          <p className="mt-1.5 text-sm text-muted">
            Once creators publish titles, they'll show up here.
          </p>
        </div>
      )}
    </div>
  );
}
