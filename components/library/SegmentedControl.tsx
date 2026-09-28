// components/library/SegmentedControl.tsx

"use client";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative flex h-11 rounded-lg bg-surface-raised p-1"
    >
      {/* Sliding thumb: one element that moves, instead of a color swap. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-md bg-surface shadow-sm transition-transform duration-300 ease-out dark:bg-border dark:shadow-none"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 text-[15px] font-semibold transition-colors ${
            option.value === value ? "text-text" : "text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
