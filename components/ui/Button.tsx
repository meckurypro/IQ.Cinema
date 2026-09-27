// components/ui/Button.tsx

"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "gold" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  // Brand primary: pink → crimson, the same gradient used for the
  // "Exclusive"/"Hot" badges on the home page — the one CTA color the
  // whole app commits to. A soft tinted glow gives it lift instead of
  // sitting flat on the surface.
  primary:
    "bg-gradient-to-r from-pink to-crimson text-white " +
    "shadow-[0_10px_24px_-10px_rgb(var(--pink)_/_0.65)] " +
    "hover:brightness-110 hover:shadow-[0_14px_30px_-8px_rgb(var(--pink)_/_0.75)] " +
    "active:brightness-95 active:shadow-[0_4px_14px_-8px_rgb(var(--pink)_/_0.5)]",
  secondary:
    "border border-border bg-surface-raised text-text " +
    "hover:bg-border/50 active:bg-border/70",
  ghost: "bg-transparent text-text hover:bg-surface-raised active:bg-border/40",
  gold:
    "bg-gold text-[rgb(20_16_8)] " +
    "shadow-[0_10px_24px_-10px_rgb(var(--gold)_/_0.5)] " +
    "hover:brightness-105 hover:shadow-[0_14px_30px_-8px_rgb(var(--gold)_/_0.6)] " +
    "active:brightness-95",
  // Solid crimson fill for actions with real consequence (destructive
  // confirms, declines) — deliberately heavier than `secondary` so it
  // never gets mistaken for a neutral choice.
  danger:
    "bg-crimson text-white " +
    "shadow-[0_10px_24px_-10px_rgb(var(--crimson)_/_0.5)] " +
    "hover:brightness-110 hover:shadow-[0_14px_30px_-8px_rgb(var(--crimson)_/_0.6)] " +
    "active:brightness-95",
};

// h-13 doesn't exist on Tailwind's default spacing scale (11 → 12 → 14),
// so the old "lg" size silently produced no height utility at all — the
// button rendered slim, sized only by its padding. Every size below is a
// real token.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-14 px-6 text-base gap-2",
  icon: "h-11 w-11 p-0",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight",
          "transition-all duration-150 ease-out",
          "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
          "active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
