// components/downloads/ProgressRing.tsx

import clsx from "clsx";

// Circular progress with room for an icon in the middle (pause / play / retry).
export function ProgressRing({
  progress,
  size = 40,
  className,
  children,
}: {
  // 0..1. Pass a negative value for an indeterminate (unknown size) ring.
  progress: number;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const indeterminate = progress < 0;
  const p = indeterminate ? 0.25 : Math.min(1, Math.max(0, progress));

  return (
    <span className={clsx("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className={clsx("-rotate-90", indeterminate && "animate-spin")} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--pink))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: indeterminate ? undefined : "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-text">{children}</span>
    </span>
  );
}
