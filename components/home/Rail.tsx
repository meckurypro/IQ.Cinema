import { TitleCard, type TitleCardData } from "@/components/title/TitleCard";

export function Rail({ heading, titles }: { heading: string; titles: TitleCardData[] }) {
  if (!titles.length) return null;

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="font-display text-[19px] font-semibold text-text">{heading}</h2>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {titles.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </section>
  );
}
