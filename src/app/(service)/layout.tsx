import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Service Operations Panel – Poornasree",
  description: "Internal service management console for Poornasree support operations.",
};

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="service" className="min-h-screen service-shell">
      {children}
    </div>
  );
}
