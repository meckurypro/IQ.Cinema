import Image from "next/image";
import Link from "next/link";

export type PopularCardData = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
};

export function PopularCard({ title, rank }: { title: PopularCardData; rank: number }) {
  return (
    <Link href={`/title/${title.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-raised">
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.title}
            fill
            sizes="240px"
            className="object-cover transition-transform duration-300 group-active:scale-95"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No poster</div>
        )}
        <span className="absolute right-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
          Hot
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-text">
        {title.title}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-pink">Daily list No. {rank}</p>
    </Link>
  );
}
