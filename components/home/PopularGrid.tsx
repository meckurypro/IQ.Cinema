import { PopularCard, type PopularCardData } from "./PopularCard";

export function PopularGrid({ heading, titles }: { heading: string; titles: PopularCardData[] }) {
  if (!titles.length) {
    return (
      <div className="mt-8 px-6 text-center">
        <p className="text-sm text-muted">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <section className="mt-6 px-4">
      <h2 className="font-display mb-3 text-[19px] font-semibold text-text">{heading}</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {titles.map((t, i) => (
          <PopularCard key={t.id} title={t} rank={i + 1} />
        ))}
      </div>
    </section>
  );
}
