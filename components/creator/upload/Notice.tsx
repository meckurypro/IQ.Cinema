// components/creator/upload/Notice.tsx
//
// An inline message that stays put next to the thing it's about. The old page
// rendered errors in one spot at the bottom of a long form, so a failure while
// the person was looking at the file picker looked like "nothing happened".
// Errors scroll themselves into view and are announced to screen readers.

"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Tone = "error" | "warning" | "success" | "info";

const STYLE: Record<Tone, string> = {
  error: "border-crimson/30 bg-crimson-soft text-crimson",
  warning: "border-gold/30 bg-gold/10 text-text",
  success: "border-emerald-500/30 bg-emerald-500/10 text-text",
  info: "border-border bg-surface-raised text-text",
};

export function Notice({
  tone,
  children,
  action,
}: {
  tone: Tone;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tone === "error") ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [tone, children]);

  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      className={clsx("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[13px] leading-snug", STYLE[tone])}
    >
      <Icon size={17} className={clsx("mt-px shrink-0", tone === "success" && "text-emerald-500", tone === "warning" && "text-gold")} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
