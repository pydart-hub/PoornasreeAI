"use client";

import { useEffect } from "react";

interface Branding {
  companyName?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    fetch("/api/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { branding?: Branding } | null) => {
        if (!data?.branding) return;
        const { primaryColor, companyName } = data.branding;

        // Apply primary color CSS variable if set
        if (primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
          document.documentElement.style.setProperty("--color-brand-primary", primaryColor);
        }

        // Update document title with company name
        if (companyName) {
          const currentTitle = document.title;
          if (!currentTitle.includes(companyName)) {
            document.title = `${companyName} — AI Support`;
          }
        }
      })
      .catch(() => {
        // Non-fatal: branding is optional
      });
  }, []);

  return <>{children}</>;
}
