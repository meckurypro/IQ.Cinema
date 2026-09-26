// components/shared/ThemeToggle.tsx

"use client";

import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import clsx from "clsx";

const options = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: MonitorSmartphone, label: "System" },
];

export function ThemeToggle() {
  const { mode, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-surface p-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
            mode === value ? "bg-pink text-white" : "text-muted hover:text-text"
          )}
        >
          <Icon size={15} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}
