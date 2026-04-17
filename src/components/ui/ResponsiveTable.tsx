"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a <table> (or grid-based table) so it scrolls horizontally on narrow
 * viewports instead of breaking the page layout.
 *
 * Usage:
 *   <ResponsiveTable>
 *     <table> … </table>
 *   </ResponsiveTable>
 */
export default function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin",
        className,
      )}
    >
      {children}
    </div>
  );
}
