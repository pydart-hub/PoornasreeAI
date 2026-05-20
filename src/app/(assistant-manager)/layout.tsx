import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assistant Manager Dashboard – Poornasree",
  description: "Assistant service manager portal for ticket assignment and team oversight.",
};

export default function AssistantManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="assistant-manager" className="min-h-[100dvh] assistant-manager-shell">
      {children}
    </div>
  );
}
