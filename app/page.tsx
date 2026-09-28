// app/page.tsx

import { createClient } from "@/lib/supabase/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { HeroBanner } from "@/components/home/HeroBanner";
import { PopularGrid } from "@/components/home/PopularGrid";
import { HomeRefresh } from "@/components/home/HomeRefresh";

export const revalidate = 60;

type SearchParams = { tab?: string; genre?: string };

async function getHomeData({ tab, genre }: SearchParams) {
  const supabase = createClient();
  const activeTab = tab ?? "popular";

  let gridQuery = supabase
    .from("titles")
    .select("id, slug, title, poster_url")
    .eq("status", "published")
    .limit(12);

  let heading = "Popular Choices";

  if (activeTab === "new") {
    gridQuery = gridQuery.order("published_at", { ascending: false });
    heading = "New Releases";
  } else if (activeTab === "ranking") {
    gridQuery = gridQuery.order("total_unique_views", { ascending: false });
    heading = "Top Ranking";
  } else if (activeTab === "genre" && genre) {
    gridQuery = gridQuery.eq("genre", genre).order("total_unique_views", { ascending: false });
    heading = `${genre} Picks`;
  } else {
    gridQuery = gridQuery.order("total_unique_views", { ascending: false });
  }

  // These three don't depend on each other, so run them concurrently instead
  // of waiting on each round trip in turn — this is the main win for
  // perceived speed on every tab/genre switch.
  const [{ data: featured }, { data: gridTitles }, { data: usedGenreRows }] = await Promise.all([
    supabase
      .from("titles")
      .select("id, slug, title, poster_url, banner_url, total_unique_views, genre")
      .eq("status", "published")
      .order("total_unique_views", { ascending: false })
      .limit(1)
      .maybeSingle(),
    gridQuery,
    // Only genres that a creator has actually published a title under —
    // not the full catalog in the `genres` table.
    supabase.from("titles").select("genre").eq("status", "published").not("genre", "is", null),
  ]);

  const genres = Array.from(new Set((usedGenreRows ?? []).map((r) => r.genre))).sort() as string[];

  // This one genuinely depends on featured.id, so it has to follow —
  // but it's now the only sequential hop instead of one of four.
  const { data: exclusive } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, banner_url")
    .eq("status", "published")
    .eq("is_exclusive", true)
    .neq("id", featured?.id ?? "")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Tapping a poster from Home goes straight into episode 1 — no summary
  // page in between — so every card needs to know its title's first
  // published episode. One query covering every title on the page, reduced
  // to the lowest episode_number per title_id.
  const allTitleIds = Array.from(
    new Set([featured?.id, exclusive?.id, ...(gridTitles ?? []).map((t) => t.id)].filter((id): id is string => !!id))
  );
  const firstEpisodeByTitle = new Map<string, string>();
  if (allTitleIds.length) {
    const { data: firstEpisodes } = await supabase
      .from("episodes")
      .select("id, title_id, episode_number")
      .in("title_id", allTitleIds)
      .eq("status", "published")
      .order("episode_number", { ascending: true });
    for (const ep of firstEpisodes ?? []) {
      if (!firstEpisodeByTitle.has(ep.title_id)) firstEpisodeByTitle.set(ep.title_id, ep.id);
    }
  }

  return {
    featured,
    exclusive,
    gridTitles: gridTitles ?? [],
    genres,
    heading,
    activeTab,
    firstEpisodeByTitle,
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { featured, exclusive, gridTitles, genres, heading, activeTab, firstEpisodeByTitle } =
    await getHomeData(searchParams);

  return (
    <HomeRefresh>
      <div className="fade-in pb-6">
        <HomeHeader />

        <CategoryTabs activeTab={activeTab} activeGenre={searchParams.genre} genres={genres} />

        {/* Keyed so switching tabs remounts just this part and replays the
            fade — the header/tab bar above stay put so a tab tap doesn't
            flicker chrome that didn't change. */}
        <div key={`${activeTab}-${searchParams.genre ?? ""}`} className="fade-in">
          <HeroBanner
            featured={
              featured
                ? {
                    ...featured,
                    genre_label: featured.genre ?? null,
                    first_episode_id: firstEpisodeByTitle.get(featured.id) ?? null,
                  }
                : null
            }
            exclusive={
              exclusive
                ? { ...exclusive, first_episode_id: firstEpisodeByTitle.get(exclusive.id) ?? null }
                : null
            }
          />

          <PopularGrid
            heading={heading}
            titles={gridTitles.map((t) => ({
              ...t,
              first_episode_id: firstEpisodeByTitle.get(t.id) ?? null,
            }))}
          />

          {!featured && !gridTitles.length && (
            <div className="mt-16 px-6 text-center">
              <p className="font-display text-lg text-text">Nothing published yet</p>
              <p className="mt-1.5 text-sm text-muted">
                Once creators publish titles, they'll show up here.
              </p>
            </div>
          )}
        </div>
      </div>
    </HomeRefresh>
  );
}
