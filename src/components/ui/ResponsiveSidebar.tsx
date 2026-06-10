"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";

interface ResponsiveSidebarProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pixel width on desktop / overlay width on mobile (default 280) */
  width?: number;
  /** Pixel width on desktop when closed (default 0) */
  miniWidth?: number;
  /** Which edge the sidebar sits on (default "left") */
  side?: "left" | "right";
  className?: string;
}

/**
 * Shared sidebar shell used across admin, sales, chat, dashboard, etc.
 *
 * - **Mobile (<768 px)**: fixed overlay with backdrop, slide in/out.
 * - **Desktop (≥768 px)**: relative-positioned collapsible panel.
 */
export default function ResponsiveSidebar({
  open,
  onClose,
  children,
  width = 280,
  miniWidth = 0,
  side = "left",
  className,
}: ResponsiveSidebarProps) {
  const isMobile = useIsMobile();
  const sidebarRef = useRef<HTMLElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isMobile || !open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMobile, open, onClose]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (!isMobile) return;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, open]);

  const isLeft = side === "left";

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isMobile && open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ 
          ["--sidebar-w" as string]: `${width}px`,
          ["--sidebar-mini-w" as string]: `${miniWidth}px`
        }}
        className={cn(
          // Base
          "flex flex-col h-full bg-surface-sidebar dark:bg-surface-dark-sidebar border-line dark:border-line-dark transition-all duration-300 ease-in-out shrink-0",
          isLeft ? "border-r" : "border-l",

          // Mobile: fixed overlay
          isMobile && [
            "fixed inset-y-0 z-40",
            isLeft ? "left-0" : "right-0",
            "w-[var(--sidebar-w)] max-w-[80vw]",
            !open && (isLeft ? "-translate-x-full" : "translate-x-full"),
          ],

          // Desktop: relative, collapsible
          !isMobile && [
            "relative",
            open ? "w-[var(--sidebar-w)]" : "w-[var(--sidebar-mini-w)] overflow-hidden",
            !open && miniWidth === 0 && (isLeft ? "border-r-0" : "border-l-0"),
          ],

          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}
