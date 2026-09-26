// components/ui/Button.tsx

"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "gold";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Brand primary: pink → crimson, the same red/pink pairing used for the
  // "Exclusive" and "Hot" badges on the home page, applied to every CTA.
  primary:
    "bg-gradient-to-r from-pink to-crimson text-white hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-raised text-text hover:bg-border/60",
  ghost: "bg-transparent text-text hover:bg-surface-raised",
  gold: "bg-gold text-[rgb(20_16_8)] hover:brightness-105 active:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-6 text-base",
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
          "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
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
