import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Control Panel – Poornasree",
  description: "System administration panel for Poornasree AI — user management, documents, and configuration.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="admin" className="min-h-screen admin-shell">
      {children}
    </div>
  );
}
