"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-10 w-10 rounded-lg bg-surface-tertiary dark:bg-surface-dark-tertiary animate-pulse", className)} />;
  }

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary",
        className
      )}
    >
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={cn(
            "relative p-2 rounded-lg transition-all duration-200",
            theme === value
              ? "bg-white dark:bg-surface-dark text-primary dark:text-primary-400 shadow-sm"
              : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
