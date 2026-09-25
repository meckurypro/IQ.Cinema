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

  const { data: featured } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, banner_url, total_unique_views, genre")
    .eq("status", "published")
    .order("total_unique_views", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: exclusive } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, banner_url")
    .eq("status", "published")
    .eq("is_exclusive", true)
    .neq("id", featured?.id ?? "")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from("titles")
    .select("id, slug, title, poster_url")
    .eq("status", "published")
    .limit(12);

  let heading = "Popular Choices";

  if (activeTab === "new") {
    query = query.order("published_at", { ascending: false });
    heading = "New Releases";
  } else if (activeTab === "ranking") {
    query = query.order("total_unique_views", { ascending: false });
    heading = "Top Ranking";
  } else if (activeTab === "genre" && genre) {
    query = query.eq("genre", genre).order("total_unique_views", { ascending: false });
    heading = `${genre} Picks`;
  } else {
    query = query.order("total_unique_views", { ascending: false });
  }

  const { data: gridTitles } = await query;

  return {
    featured,
    exclusive,
    gridTitles: gridTitles ?? [],
    heading,
    activeTab,
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { featured, exclusive, gridTitles, heading, activeTab } = await getHomeData(searchParams);

  return (
    <div className="fade-in pb-6">
      <HomeHeader />

      <CategoryTabs activeTab={activeTab} activeGenre={searchParams.genre} />

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
