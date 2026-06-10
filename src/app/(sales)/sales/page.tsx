"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Users,
  CheckCircle2,
  Loader2,
  Clock,
  Search,
  ShoppingBag,
  UserX,
  RefreshCw,
  BarChart2,
  TrendingUp,
  Activity,
  AlertTriangle,
  UserPlus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ThemeToggle, Badge, LoadingScreen, ResponsiveSidebar, Avatar, SidebarBrand } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import {
  getSalesUsers,
  createSalesUser,
  updateSalesUser,
  deleteSalesUser,
  getSalesAnalytics,
  getSalesAnalyticsTimeline,
  type ApiUser,
  type SalesCreateUserPayload,
  type SalesAnalytics,
} from "@/lib/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: "info" | "success" | "warning" | "accent" | "default" }> = {
    admin:    { label: "Administrator",    variant: "default" },
    service:  { label: "Service Engineer", variant: "info" },
    customer: { label: "Customer",         variant: "accent" },
    sales:    { label: "Sales",            variant: "success" },
  };
  return map[role] ?? { label: role, variant: "default" as const };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const today = new Date().toLocaleDateString("en-IN", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});

// ─────────────────────────────────────────────
// Create modal form type
// ─────────────────────────────────────────────
interface CreateForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const EMPTY_CREATE = (): CreateForm => ({
  email: "", password: "", firstName: "", lastName: "",
});

// ─────────────────────────────────────────────
// Edit modal form type
// ─────────────────────────────────────────────
interface EditForm {
  firstName: string;
  lastName: string;
  email: string;
  newPassword: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function SalesPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"users" | "analytics" | "feedback">("users");

  // Users state
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Analytics state
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [timeline, setTimeline] = useState<{ date: string; conversations: number; support: number }[]>([]);

  // Feedback state
  interface FeedbackItem {
    id: string;
    correctedAnswer: string;
    messageId: string | null;
    createdAt: string;
    conversation: { id: string; title: string | null; user: { firstName: string; lastName: string | null; email: string } };
    createdBy: { firstName: string; lastName: string | null; role: string };
  }
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE());
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ firstName: "", lastName: "", email: "", newPassword: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const firstCreateFieldRef = useRef<HTMLInputElement>(null);

  // ── Responsive ──────────────────────────────
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Auth guard ───────────────────────────────
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "sales") router.replace("/login");
  }, [user, isLoading, router]);

  // ── Fetch users ──────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await getSalesUsers();
      setUsers(data);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── Fetch analytics ───────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const [data, tl] = await Promise.all([
        getSalesAnalytics(),
        getSalesAnalyticsTimeline(),
      ]);
      setAnalytics(data);
      setTimeline(tl);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch feedback ────────────────────────────
  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/sales/feedback", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFeedbackItems(data.feedback || []);
      }
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "sales") {
      fetchUsers();
      fetchFeedback();
    }
  }, [user, fetchUsers, fetchFeedback]);

  useEffect(() => {
    if (activeTab === "analytics" && user?.role === "sales" && !analytics && !analyticsLoading) {
      fetchAnalytics();
    }
  }, [activeTab, user, analytics, analyticsLoading, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === "feedback" && user?.role === "sales" && feedbackItems.length === 0 && !feedbackLoading) {
      fetchFeedback();
    }
  }, [activeTab, user, feedbackItems.length, feedbackLoading, fetchFeedback]);

  // ── Validate create form ─────────────────────
  function validateCreate(f: CreateForm): Partial<Record<keyof CreateForm, string>> {
    const e: Partial<Record<keyof CreateForm, string>> = {};
    if (!f.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Enter a valid email";
    if (!f.password) e.password = "Password is required";
    else if (f.password.length < 8) e.password = "At least 8 characters";
    if (!f.firstName.trim()) e.firstName = "First name is required";
    return e;
  }

  // ── Create user ──────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCreate(createForm);
    if (Object.keys(errors).length > 0) { setCreateErrors(errors); return; }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload: SalesCreateUserPayload = {
        email: createForm.email.trim(),
        password: createForm.password,
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim() || undefined,
      };
      const created = await createSalesUser(payload);
      setUsers((prev) => [{ ...created, _count: { conversations: 0 } }, ...prev]);
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE());
      setSuccessBanner(`Customer "${created.email}" created successfully.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ── Open edit modal ──────────────────────────
  const openEdit = (u: ApiUser) => {
    setEditTarget(u);
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName ?? "",
      email: u.email,
      newPassword: "",
    });
    setEditError(null);
    setShowEditPassword(false);
  };

  // ── Save edit ────────────────────────────────
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (editForm.newPassword && editForm.newPassword.length < 8) {
      setEditError("New password must be at least 8 characters");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const payload: { firstName?: string; lastName?: string; email?: string; newPassword?: string } = {};
      if (editForm.firstName.trim() !== editTarget.firstName) payload.firstName = editForm.firstName.trim();
      if (editForm.lastName.trim() !== (editTarget.lastName ?? "")) payload.lastName = editForm.lastName.trim();
      if (editForm.email.trim() !== editTarget.email) payload.email = editForm.email.trim();
      if (editForm.newPassword) payload.newPassword = editForm.newPassword;

      if (Object.keys(payload).length === 0) {
        setEditTarget(null);
        return;
      }
      const updated = await updateSalesUser(editTarget.id, payload);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setEditTarget(null);
      setSuccessBanner(`Customer "${updated.email}" updated successfully.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Delete user ──────────────────────────────
  const handleDelete = async (u: ApiUser) => {
    if (!confirm(`Delete "${u.email}"? This cannot be undone.`)) return;
    setDeletingId(u.id);
    setDeleteError(null);
    try {
      await deleteSalesUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete customer");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Filter users ─────────────────────────────
  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const roleBadge = getRoleBadge(user?.role ?? "sales");

  if (isLoading) return <LoadingScreen message="Loading sales panel..." />;
  if (!user) return null;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* ── Sidebar ── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260} className="overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-primary-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full">
          <SidebarBrand title="Sales Panel" onClose={() => setSidebarOpen(false)} />

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {([
              { key: "users" as const, label: "Customers", icon: <Users className="w-4 h-4" />, count: users.length },
              { key: "analytics" as const, label: "Analytics", icon: <BarChart2 className="w-4 h-4" />, count: undefined },
              { key: "feedback" as const, label: "Feedback", icon: <MessageSquare className="w-4 h-4" />, count: feedbackItems.length > 0 ? feedbackItems.length : undefined },
            ]).map((item) => (
              <button
                key={item.key}
                onClick={() => { setActiveTab(item.key); if (isMobile) setSidebarOpen(false); }}
                className={cn(
                  "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  activeTab === item.key
                    ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                )}
              >
                {activeTab === item.key && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-400 rounded-full" />
                )}
                <span className={cn(activeTab === item.key ? "text-primary-300" : "text-white/50 group-hover:text-white/70")}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.count != null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user.firstName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-white/50 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 sm:px-6 py-3 flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
            >
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{today}</p>
          </div>
          <ThemeToggle />
          <Badge variant={roleBadge.variant} dot>{roleBadge.label}</Badge>
        </header>

        <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-8">

          {/* Welcome */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <ShoppingBag className="w-5 h-5 text-primary dark:text-primary-300" />
              <h1 className="text-2xl font-bold text-content dark:text-content-dark">
                {getGreeting()}, {user.firstName}!
              </h1>
            </div>
            <p className="text-content-secondary dark:text-content-dark-secondary text-sm">
              Sales Dashboard — Manage customer accounts and view system analytics.
            </p>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 mb-2">
                <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">{users.length}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Customers</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2">
                <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">
                {users.reduce((sum, u) => sum + (u._count?.conversations ?? 0), 0)}
              </p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Customer Conversations</p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
              <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-content dark:text-content-dark">{feedbackItems.length}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Feedback Entries</p>
            </div>
          </section>

          {/* Banners */}
          {successBanner && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {successBanner}
            </div>
          )}
          {deleteError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {deleteError}
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary w-fit">
            {(["users", "analytics", "feedback"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab
                    ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                    : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                {tab === "users" ? <Users className="w-3.5 h-3.5" /> : tab === "analytics" ? <BarChart2 className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                {tab === "users" ? "Customers" : tab === "analytics" ? "Analytics" : "Feedback"}
              </button>
            ))}
          </div>

          {/* ── Users Tab ── */}
          {activeTab === "users" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  Customers ({users.length})
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search users…"
                      className="h-9 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                    />
                  </div>
                  <button
                    onClick={fetchUsers}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("w-4 h-4", usersLoading && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => {
                      setCreateForm(EMPTY_CREATE());
                      setCreateErrors({});
                      setCreateError(null);
                      setShowCreatePassword(false);
                      setCreateOpen(true);
                      setTimeout(() => firstCreateFieldRef.current?.focus(), 50);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    New Customer
                  </button>
                </div>
              </div>

              {usersLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                </div>
              ) : (
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                  {/* Table header */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_1.5fr_1fr_80px_88px] gap-4 px-5 py-3 border-b border-line dark:border-line-dark bg-surface-tertiary dark:bg-surface-dark-tertiary">
                    {["User", "Email", "Role", "Chats", ""].map((h) => (
                      <span key={h} className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary">
                        {h}
                      </span>
                    ))}
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <UserX className="w-8 h-8 mx-auto mb-2 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No users found</p>
                    </div>
                  ) : (
                    filteredUsers.map((u, i) => {
                      const badge = getRoleBadge(u.role);
                      const isCustomer = u.role === "customer";
                      const isSelf = u.id === user.id;
                      return (
                        <div
                          key={u.id}
                          className={cn(
                            "flex flex-col sm:grid sm:grid-cols-[1fr_1.5fr_1fr_80px_88px] gap-2 sm:gap-4 px-5 py-4 hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors",
                            i < filteredUsers.length - 1 && "border-b border-line dark:border-line-dark"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar name={`${u.firstName} ${u.lastName ?? ""}`} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                                {u.firstName} {u.lastName ?? ""}
                                {isSelf && <span className="ml-1.5 text-xs text-primary dark:text-primary-300">(you)</span>}
                              </p>
                              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                                {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <p className="text-sm text-content-secondary dark:text-content-dark-secondary truncate">{u.email}</p>
                          </div>
                          <div className="flex items-center">
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          </div>
                          <div className="flex items-center">
                            <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
                              {u._count?.conversations ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {isCustomer && (
                              <>
                                <button
                                  onClick={() => openEdit(u)}
                                  className="p-1.5 rounded-lg text-content-secondary hover:text-primary dark:text-content-dark-secondary dark:hover:text-primary-300 hover:bg-primary/10 dark:hover:bg-primary-400/10 transition-colors"
                                  title="Edit customer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {!isSelf && (
                                  <button
                                    onClick={() => handleDelete(u)}
                                    disabled={deletingId === u.id}
                                    className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                                    title="Delete customer"
                                  >
                                    {deletingId === u.id
                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                      : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Analytics Tab ── */}
          {activeTab === "analytics" && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  Analytics Overview
                </h2>
                <button
                  onClick={() => { setAnalytics(null); fetchAnalytics(); }}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn("w-4 h-4", analyticsLoading && "animate-spin")} />
                </button>
              </div>

              {analyticsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                </div>
              ) : !analytics ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
                  <BarChart2 className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No analytics data available</p>
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <div className="inline-flex p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 mb-2">
                        <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.totalConversations}</p>
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Total Conversations</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <div className="inline-flex p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.totalSupportRequests}</p>
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Support Escalations</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <div className="inline-flex p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 mb-2">
                        <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.escalationRate}%</p>
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Escalation Rate</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <div className="inline-flex p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 mb-2">
                        <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-xl font-bold text-content dark:text-content-dark">{analytics.aiResolutionRate}%</p>
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">AI Resolution Rate</p>
                    </div>
                  </div>

                  {/* Line Chart — Activity over last 30 days */}
                  {timeline.length > 0 && (
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Activity — Last 30 Days</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={timeline} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                            tickFormatter={(v: string) => v.slice(5)}
                            interval={Math.floor(timeline.length / 6)}
                          />
                          <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Legend formatter={(v: string) => v === "conversations" ? "Conversations" : "Support Tickets"} wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Line type="monotone" dataKey="support"       stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Bar + Pie row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                    {/* Bar Chart — Top Machines */}
                    {analytics.topMachines.length > 0 && (
                      <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Top Reported Machines</h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={analytics.topMachines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.7 }} width={90} />
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Pie Chart — Support Status */}
                    <div className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-4">Support Request Status</h3>
                      {(analytics.pendingCount + analytics.activeCount + analytics.resolvedCount) === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-sm text-content-secondary dark:text-content-dark-secondary">No support requests yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Pending",  value: analytics.pendingCount  },
                                { name: "Active",   value: analytics.activeCount   },
                                { name: "Resolved", value: analytics.resolvedCount },
                              ]}
                              cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                              paddingAngle={3} dataKey="value"
                            >
                              <Cell fill="#f59e0b" />
                              <Cell fill="#3b82f6" />
                              <Cell fill="#10b981" />
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Recent Issues */}
                  {analytics.recentIssues.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark mb-3">Recent Issues</h3>
                      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                        {analytics.recentIssues.map((issue, i) => (
                          <div
                            key={issue.id}
                            className={cn(
                              "px-4 py-3",
                              i < analytics.recentIssues.length - 1 && "border-b border-line dark:border-line-dark"
                            )}
                          >
                            <p className="text-sm text-content dark:text-content-dark truncate">{issue.problem}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                                {issue.customer.firstName} {issue.customer.lastName ?? ""}
                              </span>
                              <span className={cn(
                                "text-xs font-medium px-1.5 py-0.5 rounded-full",
                                issue.status === "resolved"
                                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : issue.status === "active"
                                    ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                    : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              )}>
                                {issue.status}
                              </span>
                              <span className="text-xs text-content-secondary dark:text-content-dark-secondary ml-auto">
                                <Clock className="w-3 h-3 inline mr-0.5" />
                                {new Date(issue.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Feedback Tab ── */}
          {activeTab === "feedback" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-content dark:text-content-dark">
                  Customer Feedback ({feedbackItems.length})
                </h2>
                <button
                  onClick={() => { setFeedbackItems([]); fetchFeedback(); }}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn("w-4 h-4", feedbackLoading && "animate-spin")} />
                </button>
              </div>

              {feedbackLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
                </div>
              ) : feedbackItems.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-line dark:border-line-dark">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-content-secondary dark:text-content-dark-secondary opacity-40" />
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No feedback entries yet</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden">
                  {feedbackItems.map((fb, i) => (
                    <div
                      key={fb.id}
                      className={cn(
                        "px-5 py-4",
                        i < feedbackItems.length - 1 && "border-b border-line dark:border-line-dark"
                      )}
                    >
                      <p className="text-sm text-content dark:text-content-dark whitespace-pre-wrap">{fb.correctedAnswer}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                          Customer: {fb.conversation.user.firstName} {fb.conversation.user.lastName ?? ""}
                        </span>
                        <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                          By: {fb.createdBy.firstName} {fb.createdBy.lastName ?? ""} ({fb.createdBy.role})
                        </span>
                        <span className="text-xs text-content-secondary dark:text-content-dark-secondary ml-auto">
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          {new Date(fb.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════
          Create Customer Modal
      ════════════════════════════════════════ */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                  <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-content dark:text-content-dark">New Customer</h3>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Create a customer account</p>
                </div>
              </div>
              <button
                onClick={() => !createSubmitting && setCreateOpen(false)}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                  <input
                    ref={firstCreateFieldRef}
                    value={createForm.firstName}
                    onChange={(e) => { setCreateForm((p) => ({ ...p, firstName: e.target.value })); setCreateErrors((p) => ({ ...p, firstName: undefined })); }}
                    placeholder="First name"
                    className={cn(
                      "w-full h-9 px-3 rounded-xl border bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30",
                      createErrors.firstName ? "border-red-400 dark:border-red-500" : "border-line dark:border-line-dark"
                    )}
                  />
                  {createErrors.firstName && <p className="text-xs text-red-500 mt-1">{createErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Last name"
                    className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Email Address *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => { setCreateForm((p) => ({ ...p, email: e.target.value })); setCreateErrors((p) => ({ ...p, email: undefined })); }}
                  placeholder="customer@example.com"
                  className={cn(
                    "w-full h-9 px-3 rounded-xl border bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30",
                    createErrors.email ? "border-red-400 dark:border-red-500" : "border-line dark:border-line-dark"
                  )}
                />
                {createErrors.email && <p className="text-xs text-red-500 mt-1">{createErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    value={createForm.password}
                    onChange={(e) => { setCreateForm((p) => ({ ...p, password: e.target.value })); setCreateErrors((p) => ({ ...p, password: undefined })); }}
                    placeholder="Min. 8 characters"
                    className={cn(
                      "w-full h-9 px-3 pr-9 rounded-xl border bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30",
                      createErrors.password ? "border-red-400 dark:border-red-500" : "border-line dark:border-line-dark"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark transition-colors"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {createErrors.password && <p className="text-xs text-red-500 mt-1">{createErrors.password}</p>}
              </div>

              {/* Role indicator — locked to Customer */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Role is fixed to <strong>Customer</strong></p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => !createSubmitting && setCreateOpen(false)}
                  className="flex-1 h-9 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="flex-1 h-9 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                >
                  {createSubmitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                    : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          Edit Customer Modal
      ════════════════════════════════════════ */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface dark:bg-surface-dark-card rounded-2xl shadow-2xl border border-line dark:border-line-dark overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 dark:bg-primary-400/10">
                  <Pencil className="w-4 h-4 text-primary dark:text-primary-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-content dark:text-content-dark">Edit Customer</h3>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate max-w-[200px]">{editTarget.email}</p>
                </div>
              </div>
              <button
                onClick={() => !editSubmitting && setEditTarget(null)}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">First Name</label>
                  <input
                    value={editForm.firstName}
                    onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="First name"
                    className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input
                    value={editForm.lastName}
                    onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Last name"
                    className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm((p) => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Leave blank to keep current password"
                    className="w-full h-9 px-3 pr-9 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark transition-colors"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">Min. 8 characters if setting a new password</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => !editSubmitting && setEditTarget(null)}
                  className="flex-1 h-9 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 h-9 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                >
                  {editSubmitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
