// app/page.tsx

import { createClient } from "@/lib/supabase/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { HeroBanner } from "@/components/home/HeroBanner";
import { PopularGrid } from "@/components/home/PopularGrid";

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
  const [{ data: featured }, { data: gridTitles }, { data: genreRows }] = await Promise.all([
    supabase
      .from("titles")
      .select("id, slug, title, poster_url, banner_url, total_unique_views, genre")
      .eq("status", "published")
      .order("total_unique_views", { ascending: false })
      .limit(1)
      .maybeSingle(),
    gridQuery,
    supabase.from("genres").select("name").order("name"),
  ]);

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

  return {
    featured,
    exclusive,
    gridTitles: gridTitles ?? [],
    genres: (genreRows ?? []).map((g) => g.name),
    heading,
    activeTab,
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { featured, exclusive, gridTitles, genres, heading, activeTab } = await getHomeData(
    searchParams
  );

  return (
    <div className="fade-in pb-6">
      <HomeHeader />

      <CategoryTabs activeTab={activeTab} activeGenre={searchParams.genre} genres={genres} />

      <HeroBanner
        featured={
          featured
            ? { ...featured, genre_label: featured.genre ?? null }
            : null
        }
        exclusive={exclusive}
      />

      <PopularGrid heading={heading} titles={gridTitles} />

      {!featured && !gridTitles.length && (
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
