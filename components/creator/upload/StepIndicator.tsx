// components/creator/upload/StepIndicator.tsx
//
// "Where am I, what's left" for the upload wizard. Completed steps are
// tappable (go back and fix something); upcoming ones are not, so nobody can
// skip past a step that has to exist first.

"use client";

import clsx from "clsx";
import { Check } from "lucide-react";

export type StepState = "done" | "current" | "todo";

export function StepIndicator({
  steps,
  onSelect,
}: {
  steps: { id: string; label: string; state: StepState; clickable: boolean }[];
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.id} className={clsx("flex items-center", i < steps.length - 1 && "flex-1")}>
          <button
            type="button"
            disabled={!s.clickable}
            onClick={() => onSelect(s.id)}
            aria-current={s.state === "current" ? "step" : undefined}
            className={clsx("flex items-center gap-2 rounded-full", s.clickable ? "cursor-pointer" : "cursor-default")}
          >
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors",
                s.state === "current" && "border-pink bg-pink text-white",
                s.state === "done" && "border-pink bg-pink/10 text-pink",
                s.state === "todo" && "border-border bg-surface text-muted"
              )}
            >
              {s.state === "done" ? <Check size={14} /> : i + 1}
            </span>
            <span
              className={clsx(
                "text-[12px] font-medium",
                // Phones: only the current step keeps its label, so five steps fit.
                s.state === "current" ? "text-text" : "hidden text-muted desk:inline"
              )}
            >
              {s.label}
            </span>
          </button>
          {i < steps.length - 1 && (
            <span className={clsx("mx-2 h-px flex-1", s.state === "done" ? "bg-pink/40" : "bg-border")} />
          )}
        </li>
      ))}
    </ol>
  );
}
