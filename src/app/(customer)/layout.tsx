import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Portal – Poornasree AI",
  description: "AI-powered product guidance and troubleshooting for Poornasree customers.",
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
