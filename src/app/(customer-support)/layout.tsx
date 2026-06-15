import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Support Dashboard – Poornasree",
  description: "Customer support dashboard for live WhatsApp monitoring.",
};

export default function CustomerSupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="customer-support" className="min-h-[100dvh]">
      {children}
    </div>
  );
}
