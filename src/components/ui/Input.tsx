import React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** @deprecated Use leftIcon instead */
  icon?: React.ReactNode;
  /** @deprecated Use rightIcon instead */
  iconRight?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helper, leftIcon, rightIcon, icon, iconRight, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, "-");
    const resolvedLeft = leftIcon || icon;
    const resolvedRight = rightIcon || iconRight;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-content dark:text-content-dark"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {resolvedLeft && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-secondary dark:text-content-dark-secondary">
              {resolvedLeft}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full h-11 rounded-xl border bg-surface-tertiary dark:bg-surface-dark-tertiary",
              "text-content dark:text-content-dark text-sm",
              "placeholder:text-content-tertiary dark:placeholder:text-content-dark-secondary",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:focus:ring-primary-400/30 dark:focus:border-primary-400",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              resolvedLeft ? "pl-10" : "pl-4",
              resolvedRight ? "pr-10" : "pr-4",
              error
                ? "border-error focus:ring-error/30 focus:border-error"
                : "border-line dark:border-line-dark",
              className
            )}
            {...props}
          />
          {resolvedRight && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-secondary dark:text-content-dark-secondary">
              {resolvedRight}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-error flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
        {helper && !error && (
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
            {helper}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
