"use client";

import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional badge text (e.g. "2 Documents") */
  badge?: string;
  /** Action buttons rendered to the right */
  actions?: ReactNode;
}

export default function ScreenHeader({ title, subtitle, badge, actions }: ScreenHeaderProps) {
  return (
    <div className="flex flex-col gap-1 mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {badge}
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
