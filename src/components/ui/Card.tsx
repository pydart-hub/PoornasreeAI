import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
  className?: string;
}

const paddingClasses = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-5 sm:p-8",
};

export function Card({
  children,
  title,
  description,
  actions,
  padding = "md",
  hoverable = false,
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line dark:border-line-dark",
        "bg-surface dark:bg-surface-dark-secondary",
        "shadow-sm shadow-[var(--shadow-color)]",
        hoverable &&
          "transition-all duration-200 hover:shadow-md hover:border-primary/20 dark:hover:border-primary-400/20 cursor-pointer",
        paddingClasses[padding],
        className
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            "flex items-center justify-between",
            padding === "none" ? "px-6 pt-6" : "mb-4"
          )}
        >
          <div>
            {title && (
              <h3 className="font-semibold text-content dark:text-content-dark">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-0.5">
                {description}
              </p>
            )}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
