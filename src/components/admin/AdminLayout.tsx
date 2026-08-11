"use client";

import type { ReactNode } from "react";
import { LogOut, Menu } from "lucide-react";
import { ResponsiveSidebar, SidebarBrand, Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";

interface AdminLayoutProps {
  children: ReactNode;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
  navSections: {
    label: string;
    items: {
      key: string;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      count?: number | null;
    }[];
  }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Page title shown in the top bar (defaults to "Admin Panel") */
  pageTitle?: string;
  /** Optional action buttons rendered in the top-right of the header */
  headerActions?: ReactNode;
}

export default function AdminLayout({
  children,
  sidebarOpen,
  onToggleSidebar,
  onLogout,
  navSections,
  activeTab,
  onTabChange,
  pageTitle = "Admin Panel",
  headerActions,
}: AdminLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="h-[100dvh] flex overflow-hidden">
      {/* ── Sidebar ── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={onToggleSidebar} width={260} miniWidth={68}>
        <div className="flex flex-col h-full bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900">
          <SidebarBrand title={pageTitle} compact className="border-white/10" showText={sidebarOpen} />

          <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
            {navSections.map((section) => (
              <div key={section.label}>
                {sidebarOpen && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-3">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map(({ key, label, icon: Icon, count }) => (
                    <button
                      key={key}
                      onClick={() => onTabChange(key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                        activeTab === key
                          ? "bg-white/20 text-white font-semibold"
                          : "text-white/60 hover:text-white hover:bg-white/10",
                        !sidebarOpen && "justify-center",
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0 opacity-70" />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1 text-left truncate">{label}</span>
                          {count !== null && (
                            <span
                              className={cn(
                                "text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                activeTab === key ? "bg-white/20 text-white" : "bg-white/10 text-white/60",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User + logout at bottom */}
          <div className="shrink-0 border-t border-white/10 px-3 py-3 space-y-2">
            <div className={cn("flex items-center gap-2 rounded-xl", sidebarOpen ? "px-2 py-2" : "justify-center py-1")}>
              <Avatar name={`${user?.firstName} ${user?.lastName ?? ""}`} size="sm" status="online" />
              {sidebarOpen && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {user?.firstName} {user?.lastName ?? ""}
                  </p>
                  <p className="text-[10px] text-white/50 truncate">{user?.email}</p>
                </div>
              )}
            </div>
            <button
              onClick={onLogout}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors",
                !sidebarOpen && "justify-center",
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>Sign out</span>}
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-100">
        {/* ── Header bar ── */}
        <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 h-14 bg-white border-b border-slate-200 shadow-sm">
          <button
            onClick={onToggleSidebar}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-slate-800">{pageTitle}</h1>
          <div className="ml-auto flex items-center gap-2">{headerActions}</div>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
