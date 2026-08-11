"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export interface SubNavItem<T extends string = string> {
  key: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  count?: number | null;
  description?: string;
}

interface SubNavProps<T extends string = string> {
  items: SubNavItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  title?: string;
  subtitle?: string;
}

export default function SubNav<T extends string>({
  items,
  activeTab,
  onTabChange,
  title,
  subtitle,
}: SubNavProps<T>) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-4">
      {(title || subtitle) && (
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
          {title && <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>}
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      )}

      {/* Pill tabs list */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {items.map(({ key, label, icon: Icon, count }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 duration-150",
                isActive
                  ? "bg-primary text-white shadow-sm ring-2 ring-primary/20"
                  : "bg-slate-100/80 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
              )}
            >
              {Icon && <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-500 dark:text-slate-400")} />}
              <span>{label}</span>
              {count !== undefined && count !== null && (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
