import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sales Dashboard – Poornasree",
  description: "Sales management panel for Poornasree AI — customer account management and analytics.",
};

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="sales" className="min-h-screen sales-shell">
      {children}
    </div>
  );
}
