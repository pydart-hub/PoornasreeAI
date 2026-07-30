import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Super Admin – Poornasree",
  description: "System keys and runtime configuration for Poornasree AI.",
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="super-admin" className="min-h-[100dvh] admin-shell">
      {children}
    </div>
  );
}
