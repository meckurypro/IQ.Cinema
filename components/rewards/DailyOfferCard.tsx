// components/rewards/DailyOfferCard.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import type { DailyOffer } from "@/lib/rewards";

export function DailyOfferCard({ offer }: { offer: DailyOffer }) {
  return (
    <Link href={`/title/${offer.slug}`} className="w-[112px] shrink-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface-raised">
        {offer.poster_url && (
          <Image src={offer.poster_url} alt="" fill sizes="112px" className="object-cover" />
        )}
        <span className="absolute left-0 top-0 rounded-br-md bg-crimson px-1.5 py-0.5 text-[10px] font-bold text-white">
          ≈{offer.discount_percent}% OFF
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12.5px] font-medium leading-tight text-text">
        {offer.title}
      </p>
    </Link>
  );
}
