// components/library/PosterCard.tsx

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { progressLabel, watchHref, type MyListItem } from "@/lib/myList";
import { SelectDot } from "./SelectDot";

// Grid card for the Following and Reminder tabs.
export function PosterCard({
  item,
  editing,
  selected,
  onToggleSelect,
  upcoming = false,
}: {
  item: MyListItem;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  // Coming-soon titles have nothing to resume: link to the title page and
  // show a status line instead of episode progress.
  upcoming?: boolean;
}) {
  const label = item.tags[0];

  const body = (
    <>
      <div
        className={clsx(
          "relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-raised transition-shadow",
          selected && "ring-2 ring-pink"
        )}
      >
        {item.poster_url ? (
          <Image
            src={item.poster_url}
            alt={item.title}
            fill
            sizes="(max-width: 448px) 33vw, 150px"
            className={clsx("object-cover transition-transform duration-300", !editing && "group-active:scale-95")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No poster</div>
        )}

        {item.is_exclusive && (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Exclusive
          </span>
        )}

        {item.has_new_episode && (
          <span className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-lg bg-gradient-to-r from-orange-500 to-pink px-2 py-1 text-[12px] font-bold leading-none text-white">
            <Sparkles size={12} className="fill-white" />
            New EP
          </span>
        )}

        {label && (
          <span className="absolute bottom-1.5 left-1.5 max-w-[78%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {label}
          </span>
        )}

        {editing && <SelectDot selected={selected} className="absolute bottom-1.5 right-1.5" />}
      </div>

      <p className="mt-2 truncate text-[14px] font-semibold text-text">{item.title.trim()}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">{upcoming ? "Coming soon" : progressLabel(item)}</p>
    </>
  );

  if (editing) {
    return (
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={`${selected ? "Deselect" : "Select"} ${item.title.trim()}`}
        className="group min-w-0 text-left"
      >
        {body}
      </button>
    );
  }

  return (
    <Link href={upcoming ? `/title/${item.slug}` : watchHref(item)} className="group min-w-0">
      {body}
    </Link>
  );
}
