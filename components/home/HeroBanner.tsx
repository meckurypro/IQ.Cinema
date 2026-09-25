import Image from "next/image";
import Link from "next/link";

type HeroTitle = {
  slug: string;
  title: string;
  poster_url: string | null;
  banner_url: string | null;
  genre_label?: string | null;
};

export function HeroBanner({
  featured,
  exclusive,
}: {
  featured: HeroTitle | null;
  exclusive: HeroTitle | null;
}) {
  if (!featured) return null;

  return (
    <div className="mt-4 flex gap-2 px-4">
      <Link
        href={`/title/${featured.slug}`}
        className="relative aspect-[4/5] flex-[2] overflow-hidden rounded-lg bg-surface-raised"
      >
        {(featured.banner_url ?? featured.poster_url) && (
          <Image
            src={featured.banner_url ?? featured.poster_url!}
            alt={featured.title}
            fill
            sizes="360px"
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          {featured.genre_label && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-gold">
              {featured.genre_label}
            </p>
          )}
          <p className="line-clamp-1 text-[15px] font-semibold text-white">{featured.title}</p>
        </div>
      </Link>

      {exclusive && (
        <Link
          href={`/title/${exclusive.slug}`}
          className="relative aspect-[4/5] flex-1 overflow-hidden rounded-lg bg-surface-raised"
        >
          {(exclusive.banner_url ?? exclusive.poster_url) && (
            <Image
              src={exclusive.banner_url ?? exclusive.poster_url!}
              alt={exclusive.title}
              fill
              sizes="180px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-pink px-1.5 py-0.5 text-[9px] font-semibold text-white">
            Exclusive
          </span>
          <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-2 text-[12px] font-medium leading-tight text-white">
            {exclusive.title}
          </p>
        </Link>
      )}
    </div>
  );
}
