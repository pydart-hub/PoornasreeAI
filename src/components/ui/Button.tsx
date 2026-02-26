import React from "react";
import { cn } from "@/lib/utils";

// ── Variants ──
const variants = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20",
  secondary:
    "bg-surface-tertiary text-content hover:bg-line dark:bg-surface-dark-tertiary dark:text-content-dark dark:hover:bg-line-dark",
  ghost:
    "bg-transparent text-content hover:bg-surface-tertiary dark:text-content-dark dark:hover:bg-surface-dark-tertiary",
  danger:
    "bg-error text-white hover:bg-red-600 shadow-sm shadow-error/20",
  accent:
    "bg-accent text-white hover:bg-accent-hover shadow-sm shadow-accent/20",
  outline:
    "bg-transparent border-2 border-primary text-primary hover:bg-primary hover:text-white dark:border-primary-400 dark:text-primary-400 dark:hover:bg-primary-400 dark:hover:text-surface-dark",
};

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
  icon: "h-10 w-10 rounded-lg",
  "icon-sm": "h-8 w-8 rounded-lg",
};

// ── Props ──
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "focus-ring disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
export { Button };
export type { ButtonProps };
