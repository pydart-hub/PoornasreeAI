import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Service Panel – Poornasree",
  description: "Customer service dashboard for Poornasree support operations.",
};

export default function CustomerServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="customer-service" className="min-h-screen">
      {children}
    </div>
  );
}
