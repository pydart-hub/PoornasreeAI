import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dealer Portal – Poornasree",
  description: "Dealer portal for raising and tracking service tickets.",
};

export default function DealerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="dealer" className="min-h-screen dealer-shell">
      {children}
    </div>
  );
}
