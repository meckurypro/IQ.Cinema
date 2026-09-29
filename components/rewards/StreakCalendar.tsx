// components/rewards/StreakCalendar.tsx

"use client";

import { Check, Zap } from "lucide-react";
import clsx from "clsx";

export function StreakCalendar({
  schedule,
  todayIndex,
  checkedInToday,
}: {
  schedule: { day_index: number; coins: number }[];
  todayIndex: number;
  checkedInToday: boolean;
}) {
  return (
    <div role="list" aria-label="7-day check-in streak" className="grid grid-cols-7 gap-1.5">
      {schedule.map((d) => {
        const isToday = d.day_index === todayIndex;
        const isPast = d.day_index < todayIndex || (isToday && checkedInToday);
        return (
          <div
            key={d.day_index}
            role="listitem"
            className={clsx(
              "flex flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors",
              isToday && !checkedInToday
                ? "bg-gradient-to-b from-pink to-crimson text-white shadow-[0_8px_18px_-8px_rgb(var(--pink)_/_0.6)]"
                : isPast
                ? "bg-crimson-soft text-crimson"
                : "bg-surface-raised text-muted"
            )}
          >
            <span className="text-[10px] font-medium opacity-90">Day{d.day_index}</span>
            <span
              className={clsx(
                "flex h-6 w-6 items-center justify-center rounded-full",
                isPast ? "bg-crimson text-white" : isToday ? "bg-white/25" : "bg-border"
              )}
            >
              {isPast ? (
                <Check size={13} className={isToday ? "text-white" : "text-white"} />
              ) : (
                <Zap size={12} className={isToday ? "fill-white text-white" : "fill-gold text-gold"} />
              )}
            </span>
            <span className="text-[10.5px] font-semibold">+{d.coins}</span>
          </div>
        );
      })}
    </div>
  );
}
