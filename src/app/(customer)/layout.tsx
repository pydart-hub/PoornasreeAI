import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Support Assistant – Poornasree",
  description: "Get instant AI-powered product guidance and troubleshooting support, 24/7.",
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="customer" className="min-h-[100dvh] customer-shell">
      {children}
    </div>
  );
}
