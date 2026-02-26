import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon" | "flower";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: { full: { w: 120, h: 36 }, icon: { w: 28, h: 28 }, flower: { w: 28, h: 28 } },
  md: { full: { w: 160, h: 48 }, icon: { w: 36, h: 36 }, flower: { w: 36, h: 36 } },
  lg: { full: { w: 200, h: 60 }, icon: { w: 48, h: 48 }, flower: { w: 48, h: 48 } },
  xl: { full: { w: 280, h: 84 }, icon: { w: 64, h: 64 }, flower: { w: 64, h: 64 } },
};

const srcMap = {
  full: "/fulllogo.png",
  icon: "/flogo.png",
  flower: "/flower.png",
};

export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  const dims = sizeMap[size][variant];

  return (
    <Image
      src={srcMap[variant]}
      alt="Poornasree AI"
      width={dims.w}
      height={dims.h}
      className={cn("object-contain", className)}
      priority
    />
  );
}
