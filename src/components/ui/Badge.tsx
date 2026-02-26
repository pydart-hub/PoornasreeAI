import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "accent";
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}

const variantClasses = {
  default: "bg-surface-tertiary text-content-secondary dark:bg-surface-dark-tertiary dark:text-content-dark-secondary",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  error: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  accent: "bg-accent-light text-accent-700 dark:bg-accent/10 dark:text-accent-400",
};

const dotColors = {
  default: "bg-content-tertiary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  accent: "bg-accent",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
