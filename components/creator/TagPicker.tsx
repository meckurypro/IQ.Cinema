// components/creator/TagPicker.tsx

"use client";

import clsx from "clsx";
import { useI18n } from "@/hooks/useI18n";

export const MAX_EXTRA_TAGS = 3;

// Extra "vibe" tags a creator can add on top of the primary genre, e.g.
// Drama + Revenge + Family Saga. Chips instead of a dropdown so several can
// be toggled quickly on a phone. The primary genre is excluded — it's always
// shown as a tag already. Tag names come from the genres table as-is.
export function TagPicker({
  options,
  primary,
  selected,
  onChange,
}: {
  options: string[];
  primary: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const choices = options.filter((o) => o !== primary);
  const full = selected.length >= MAX_EXTRA_TAGS;

  function toggle(name: string) {
    if (selected.includes(name)) onChange(selected.filter((s) => s !== name));
    else if (!full) onChange([...selected, name]);
  }

  return (
    <div>
      <p className="mb-2 text-[12px] text-muted">
        {t("tags.extraHint", { max: MAX_EXTRA_TAGS, n: selected.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((name) => {
          const on = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              disabled={!on && full}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-150 active:scale-95",
                on
                  ? "border-pink bg-pink/10 text-pink"
                  : "border-border bg-surface text-muted disabled:opacity-40"
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
