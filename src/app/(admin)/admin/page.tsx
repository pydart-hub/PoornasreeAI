"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LoadingScreen } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  Upload,
  ChevronRight,
  Activity,
} from "lucide-react";

// ── Nav items ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard",  id: "dashboard",  active: true  },
  { icon: Users,           label: "Users",       id: "users"                     },
  { icon: FileText,        label: "Documents",   id: "documents"                 },
  { icon: BarChart3,       label: "Analytics",   id: "analytics"                 },
  { icon: Settings,        label: "Settings",    id: "settings"                  },
];

// ── Stat card data ─────────────────────────────────────────────────────
const STAT_CARDS = [
  {
    label:   "Total Users",
    value:   "—",
    icon:    Users,
    color:   "text-indigo-600 dark:text-indigo-400",
    bg:      "bg-indigo-50 dark:bg-indigo-500/10",
    border:  "border-indigo-100 dark:border-indigo-500/20",
    note:    "User management coming soon",
  },
  {
    label:   "Total Conversations",
    value:   "—",
    icon:    MessageSquare,
    color:   "text-sky-600 dark:text-sky-400",
    bg:      "bg-sky-50 dark:bg-sky-500/10",
    border:  "border-sky-100 dark:border-sky-500/20",
    note:    "Aggregate across all roles",
  },
  {
    label:   "Escalated Cases",
    value:   "—",
    icon:    AlertTriangle,
    color:   "text-amber-600 dark:text-amber-400",
    bg:      "bg-amber-50 dark:bg-amber-500/10",
    border:  "border-amber-100 dark:border-amber-500/20",
    note:    "Awaiting R&D review",
  },
  {
    label:   "Documents Uploaded",
    value:   "—",
    icon:    Upload,
    color:   "text-emerald-600 dark:text-emerald-400",
    bg:      "bg-emerald-50 dark:bg-emerald-500/10",
    border:  "border-emerald-100 dark:border-emerald-500/20",
    note:    "Document pipeline coming soon",
  },
];

// ── Overview sections ──────────────────────────────────────────────────
const OVERVIEW_ITEMS = [
  {
    title:       "User Management",
    description: "Create, edit, and deactivate user accounts. Assign roles and departments across the organisation.",
    status:      "Planned",
    icon:        Users,
  },
  {
    title:       "Document Library",
    description: "Upload product documentation and training material. Documents power the RAG-based AI pipeline.",
    status:      "Planned",
    icon:        FileText,
  },
  {
    title:       "AI Pipeline",
    description: "Monitor the Ollama + Qdrant vector store. Trigger re-indexing, review feedback corrections.",
    status:      "Planned",
    icon:        Activity,
  },
  {
    title:       "System Configuration",
    description: "Manage API keys, LLM model selection, and role-permission overrides.",
    status:      "Planned",
    icon:        Settings,
  },
];

// ═════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const router   = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [activeNav, setActiveNav] = useState("dashboard");

  // ── Role guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      if (!user)                    { router.replace("/login"); return; }
      if (user.role !== "admin")    { router.replace("/");     return; }
    }
  }, [user, isLoading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (isLoading) return <LoadingScreen message="Loading Admin Panel…" />;
  if (!user)     return null;

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ── Top Header ─────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 flex items-center justify-between px-6
                         bg-gray-900 border-b border-gray-700 z-10">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-100 tracking-tight">
            Admin Control Panel
          </span>
          <Badge variant="info" dot>Admin</Badge>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-sm text-gray-400">
            {user.firstName} {user.lastName ?? ""}
          </span>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                       text-gray-400 hover:text-red-400 hover:bg-red-500/10
                       border border-transparent hover:border-red-500/20
                       transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar ─────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col
                          bg-gray-900 border-r border-gray-700 py-4">
          <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Navigation
          </p>

          <nav className="flex-1 space-y-0.5 px-2">
            {NAV_ITEMS.map(({ icon: Icon, label, id }) => {
              const isActive = activeNav === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveNav(id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 font-medium"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-indigo-400" : "")} />
                  {label}
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400/60" />}
                </button>
              );
            })}
          </nav>

          {/* Bottom meta */}
          <div className="px-4 pt-3 border-t border-gray-700 mt-2">
            <p className="text-[10px] text-gray-600">Poornasree AI · v1.0</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Admin Build</p>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

          {/* Page title */}
          <div>
            <h1 className="text-xl font-bold text-content dark:text-content-dark">
              System Dashboard
            </h1>
            <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-0.5">
              Welcome back, {user.firstName}. Here&apos;s a system overview.
            </p>
          </div>

          {/* ── Stat Cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {STAT_CARDS.map(({ label, value, icon: Icon, color, bg, border, note }) => (
              <div
                key={label}
                className={cn(
                  "rounded-2xl border p-5 bg-white dark:bg-gray-900 shadow-sm",
                  border
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-1">
                      {label}
                    </p>
                    <p className="text-3xl font-bold text-content dark:text-content-dark">
                      {value}
                    </p>
                    <p className="text-xs text-content-tertiary dark:text-content-dark-secondary mt-1.5">
                      {note}
                    </p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bg)}>
                    <Icon className={cn("w-5 h-5", color)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── System Overview ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-semibold text-content dark:text-content-dark">
                System Overview
              </h2>
              <div className="flex-1 h-px bg-line dark:bg-line-dark" />
            </div>
            <p className="text-sm text-content-secondary dark:text-content-dark-secondary mb-4 max-w-2xl">
              Manage users, documents, and system configuration from this panel.
              Each section below represents a module that will be activated as the system matures.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OVERVIEW_ITEMS.map(({ title, description, status, icon: Icon }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-line dark:border-line-dark
                             bg-white dark:bg-gray-900 p-5 flex gap-4 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10
                                  flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-content dark:text-content-dark">
                        {title}
                      </p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full
                                       bg-gray-100 dark:bg-gray-800
                                       text-gray-500 dark:text-gray-400 border
                                       border-gray-200 dark:border-gray-700">
                        {status}
                      </span>
                    </div>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Role Info Banner ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20
                          bg-indigo-50 dark:bg-indigo-500/5 px-5 py-4
                          flex items-center gap-4">
            <ShieldCheck className="w-6 h-6 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                You have full system access
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                As an admin you can manage all users, conversations, documents, and system
                configuration. Backend modules will unlock as they are implemented.
              </p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
