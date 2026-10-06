// app/loading.tsx

import { Skeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-5 desk:px-0 desk:pt-8">
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-md" />
      </div>

      <div className="flex items-center gap-5 px-4 pt-4">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>

      <Skeleton className="mx-4 mt-4 h-56 rounded-xl desk:mx-0 desk:h-72" />

      <div className="mt-6 grid grid-cols-3 gap-2 px-4 desk:grid-cols-6 desk:gap-5 desk:px-0">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-md" />
        ))}
      </div>
    </div>
  );
}
