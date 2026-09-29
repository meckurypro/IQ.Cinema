// app/search/page.tsx

import { SearchIntro } from "@/components/search/SearchIntro";

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <SearchIntro q={searchParams.q} />
    </main>
  );
}
