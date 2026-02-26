import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  status?: "online" | "offline" | "away";
  className?: string;
}

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

const statusSizeClass = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const statusColorClass = {
  online: "bg-accent",
  offline: "bg-content-tertiary",
  away: "bg-warning",
};

export function Avatar({ src, name, size = "md", status, className }: AvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size === "sm" ? 32 : size === "md" ? 40 : 48}
          height={size === "sm" ? 32 : size === "md" ? 40 : 48}
          className={cn(
            "rounded-full object-cover ring-2 ring-surface dark:ring-surface-dark",
            sizeClass[size]
          )}
        />
      ) : (
        <div
          className={cn(
            "rounded-full flex items-center justify-center font-semibold",
            "bg-primary/10 text-primary dark:bg-primary-400/10 dark:text-primary-400",
            sizeClass[size]
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-surface dark:ring-surface-dark",
            statusSizeClass[size],
            statusColorClass[status]
          )}
        />
      )}
    </div>
  );
}
