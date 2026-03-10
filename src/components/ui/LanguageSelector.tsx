"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";

interface LanguageSelectorProps {
  language: string;
  onLanguageChange: (code: string) => void;
  translating?: boolean;
  compact?: boolean;
}

export default function LanguageSelector({
  language,
  onLanguageChange,
  translating,
  compact,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === language);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        {current?.flag}{" "}
        {!compact && (
          <span className="hidden sm:inline">
            {translating ? <span className="animate-pulse">&hellip;</span> : current?.label}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card shadow-lg overflow-hidden">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => { onLanguageChange(l.code); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2",
                  language === l.code
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                    : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <span>{l.flag}</span> {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
