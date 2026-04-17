import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Service Manager Dashboard – Poornasree",
  description: "Service manager portal for ticket assignment and team oversight.",
};

export default function ServiceManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="service-manager" className="min-h-[100dvh] service-manager-shell">
      {children}
    </div>
  );
}
