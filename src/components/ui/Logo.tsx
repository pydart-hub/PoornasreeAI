import Image from "next/image";
import { PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

/** Canonical brand mark (public/images/flogo.png) */
export const BRAND_LOGO_SRC = "/images/flogo.png";

interface LogoProps {
  variant?: "full" | "icon" | "brand" | "flower";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
}

const sizeMap = {
  sm: { full: { w: 120, h: 36 }, icon: { w: 28, h: 28 }, brand: { w: 140, h: 48 }, flower: { w: 28, h: 28 } },
  md: { full: { w: 160, h: 48 }, icon: { w: 36, h: 36 }, brand: { w: 180, h: 56 }, flower: { w: 36, h: 36 } },
  lg: { full: { w: 200, h: 60 }, icon: { w: 48, h: 48 }, brand: { w: 220, h: 72 }, flower: { w: 48, h: 48 } },
  xl: { full: { w: 280, h: 84 }, icon: { w: 64, h: 64 }, brand: { w: 280, h: 88 }, flower: { w: 64, h: 64 } },
};

const srcMap = {
  full: BRAND_LOGO_SRC,
  icon: BRAND_LOGO_SRC,
  brand: BRAND_LOGO_SRC,
  flower: BRAND_LOGO_SRC,
};

export function Logo({ variant = "full", size = "md", className, priority }: LogoProps) {
  const dims = sizeMap[size][variant];

  return (
    <Image
      src={srcMap[variant]}
      alt="Poornasree Equipments"
      width={dims.w}
      height={dims.h}
      className={cn("object-contain", className)}
      priority={priority}
    />
  );
}

interface SidebarBrandProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  compact?: boolean;
  className?: string;
}

/** Sidebar header: brand logo + portal title (all role dashboards). */
export function SidebarBrand({
  title,
  subtitle = "Poornasree AI",
  onClose,
  compact = false,
  className,
}: SidebarBrandProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 shrink-0 border-b border-white/10",
        compact ? "px-4 py-3" : "px-4 py-5",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center flex-shrink-0 p-1",
          compact ? "w-8 h-8" : "w-9 h-9",
        )}
      >
        <Logo variant="icon" size="sm" className="w-full h-full" priority />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-tight truncate">{title}</p>
        <p className="text-[10px] text-white/50 font-medium truncate">{subtitle}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close menu"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
