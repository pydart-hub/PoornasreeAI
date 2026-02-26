import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

interface LoadingScreenProps {
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({
  message = "Loading...",
  className,
  fullScreen = true,
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6",
        fullScreen && "fixed inset-0 z-50 bg-surface dark:bg-surface-dark",
        className
      )}
    >
      {/* Logo with pulse animation as loading indicator */}
      <div className="relative">
        <div className="animate-pulse-slow">
          <Logo variant="full" size="lg" />
        </div>
        {/* Subtle glow ring */}
        <div className="absolute inset-0 -m-4 rounded-full bg-primary/5 dark:bg-primary-400/5 animate-ping" style={{ animationDuration: "2s" }} />
      </div>

      {/* Loading dots */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary dark:bg-primary-400 animate-bounce-dot"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
        <span className="text-sm text-content-secondary dark:text-content-dark-secondary ml-2">
          {message}
        </span>
      </div>
    </div>
  );
}

export function LoadingSpinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" };
  return (
    <svg
      className={cn("animate-spin text-primary dark:text-primary-400", sizeClass[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
