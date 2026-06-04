"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Loading";
import { ResponsiveSidebar, SidebarBrand } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import { getCustomerAnalytics, type CustomerAnalytics } from "@/lib/api";
import { getSocket, closeSocket } from "@/lib/socket-client";
import {
  LogOut,
  RefreshCw,
  Send,
  CheckCircle2,
  Inbox,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Wrench,
  Clock,
  Activity,
  BarChart3,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  ChevronLeft,
  X,
  Info,
  AlertTriangle,
  HelpCircle,
  Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
interface SupportCustomer { id: string; firstName: string; lastName?: string | null; email: string; }
interface SupportRequestItem {
  id: string; customerId: string; engineerId: string | null;
  problem: string; machineName: string | null;
  status: "pending" | "active" | "resolved"; createdAt: string;
  customer: SupportCustomer;
  engineer: { id: string; firstName: string; lastName?: string } | null;
  _count: { chatMessages: number };
}
interface SupportChatMessage {
  id: string; senderId: string; content: string; createdAt: string;
  sender: { id: string; firstName: string; lastName?: string; role: string };
}
interface Toast { id: number; message: string; type: "success" | "info" | "warning"; }

// ── Helpers ────────────────────────────────────────────────────────────
const Q_STATUSES = ["all", "pending", "active", "resolved"] as const;

const NAV_ITEMS = [
  { id: "queue" as const, icon: Inbox, label: "Support Queue" },
  { id: "analytics" as const, icon: BarChart3, label: "Analytics" },
];

// ═══════════════════════════════════════════════════════════════════════
export default function CustomerServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"queue" | "analytics">("queue");

  // ── Support Queue state ────────────────────────────────────────────
  const [supportRequests, setSupportRequests] = useState<SupportRequestItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "pending" | "active" | "resolved">("all");
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportChatMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // ── Analytics state ────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const supportEndRef = useRef<HTMLDivElement>(null);

  // ── Responsive ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && user.role !== "customer_service") router.replace("/");
  }, [user, authLoading, router]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastId.current;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Socket.IO ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || user.role !== "customer_service") return;
    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });
    sock.on("request:new", (req: SupportRequestItem) => {
      setSupportRequests((p) => [req, ...p]);
      addToast(`New support request from ${req.customer.firstName}`, "info");
    });
    sock.on("request:updated", (req: SupportRequestItem) => {
      setSupportRequests((p) => p.map((r) => (r.id === req.id ? req : r)));
    });
    sock.on("chat:message", ({ requestId, message }: { requestId: string; message: SupportChatMessage }) => {
      if (activeSupportId === requestId) setSupportMessages((p) => [...p, message]);
    });
    return () => { sock.off("request:new"); sock.off("request:updated"); sock.off("chat:message"); closeSocket(); };
  }, [user, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeSupportId || !user) return;
    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });
    sock.emit("support:join", activeSupportId);
    return () => { sock.emit("support:leave", activeSupportId); };
  }, [activeSupportId, user]);

  // ── Data fetching ──────────────────────────────────────────────────
  const fetchSupportRequests = useCallback(async () => {
    setQueueLoading(true);
    try {
      const r = await fetch("/api/support/requests", { credentials: "include" });
      if (r.ok) { const d = await r.json(); setSupportRequests(d.requests); }
    } finally { setQueueLoading(false); }
  }, []);

  const fetchSupportMessages = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/support/requests/${id}/messages`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setSupportMessages(d.messages); }
    } catch { /* non-fatal */ }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getCustomerAnalytics();
      setAnalytics(data);
    } catch { addToast("Failed to load analytics", "warning"); }
    finally { setAnalyticsLoading(false); }
  }, [addToast]);

  useEffect(() => {
    if (user && user.role === "customer_service") { fetchSupportRequests(); }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeSupportId) fetchSupportMessages(activeSupportId); }, [activeSupportId, fetchSupportMessages]);
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages]);

  // ── Derived ────────────────────────────────────────────────────────
  const filteredQueue = supportRequests.filter((r) => queueFilter === "all" || r.status === queueFilter);
  const activeReq = supportRequests.find((r) => r.id === activeSupportId) ?? null;
  const pendingCount = supportRequests.filter((r) => r.status === "pending").length;
  const activeCount = supportRequests.filter((r) => r.status === "active").length;

  // ── Support actions ────────────────────────────────────────────────
  const handleAcceptRequest = async (requestId: string) => {
    setAcceptingId(requestId);
    try {
      const r = await fetch(`/api/support/requests/${requestId}/accept`, { method: "PATCH", credentials: "include" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setSupportRequests((p) => p.map((x) => (x.id === requestId ? d.request : x)));
      setActiveSupportId(requestId);
      addToast("Support request accepted", "success");
    } catch { addToast("Failed to accept request", "warning"); }
    finally { setAcceptingId(null); }
  };

  const handleResolveSupport = async (requestId: string) => {
    try {
      const r = await fetch(`/api/support/requests/${requestId}/resolve`, { method: "PATCH", credentials: "include" });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setSupportRequests((p) => p.map((x) => (x.id === requestId ? d.request : x)));
      setActiveSupportId(null); setSupportMessages([]);
      addToast("Support request resolved", "success");
    } catch { addToast("Failed to resolve request", "warning"); }
  };

  const handleSendSupportMessage = async () => {
    if (!supportReplyText.trim() || !activeSupportId || supportSending) return;
    setSupportSending(true);
    const text = supportReplyText.trim();
    setSupportReplyText("");
    try {
      const r = await fetch(`/api/support/requests/${activeSupportId}/messages`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setSupportMessages((p) => [...p, d.message]);
    } catch { setSupportReplyText(text); addToast("Failed to send message", "warning"); }
    finally { setSupportSending(false); }
  };

  const onKeySupport = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSendSupportMessage(); }
  };

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  const showQueueDetail = tab === "queue" && activeSupportId !== null;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* ── SIDEBAR ───────────────────────────────────────── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={240} className="overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950 via-blue-900 to-indigo-950" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-sky-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-blue-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full">
          <SidebarBrand title="Customer Service" onClose={() => setSidebarOpen(false)} />

          {/* Stats strip */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <p className="text-lg font-bold text-amber-300">{pendingCount}</p>
                <p className="text-[10px] text-white/60 font-medium">Pending</p>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-300">{activeCount}</p>
                <p className="text-[10px] text-white/60 font-medium">Active</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    if (id === "queue") fetchSupportRequests();
                    if (id === "analytics") fetchAnalytics();
                    if (isMobile) setSidebarOpen(false);
                  }}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isActive
                      ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                      : "text-white/60 hover:text-white hover:bg-white/8"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sky-400 rounded-full" />
                  )}
                  <span className={cn(isActive ? "text-sky-300" : "text-white/50 group-hover:text-white/70")}>
                    <Icon className="w-4 h-4 shrink-0" />
                  </span>
                  <span className="flex-1 text-left">{label}</span>
                  {id === "queue" && pendingCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/30 text-amber-300">{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user.firstName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-white/50 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={async () => { await logout(); router.replace("/login"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ── MAIN ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Sticky header */}
        <header className="shrink-0 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 sm:px-5 py-3 flex items-center gap-3 z-10">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
            >
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-content dark:text-content-dark truncate">
              {tab === "queue" ? "Support Queue" : "Customer Analytics"}
            </h1>
            <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary">
            </p>
          </div>
          <Badge variant="warning" dot>Customer Service</Badge>
          <ThemeToggle />
        </header>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">

          {/* ══════════════════════════════════════════════════════ */}
          {/* SUPPORT QUEUE                                          */}
          {/* ══════════════════════════════════════════════════════ */}
          {tab === "queue" && (
            <>
              {/* List */}
              <div className={cn(
                "w-full sm:w-72 md:w-80 shrink-0 flex flex-col border-r border-line dark:border-line-dark bg-surface-sidebar dark:bg-surface-dark-sidebar overflow-hidden",
                showQueueDetail ? "hidden sm:flex" : "flex"
              )}>
                <div className="px-3 py-2.5 border-b border-line dark:border-line-dark flex items-center gap-2 flex-wrap bg-surface dark:bg-surface-dark">
                  {Q_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setQueueFilter(s)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] sm:text-[10px] font-semibold capitalize transition-colors",
                        queueFilter === s
                          ? s === "pending" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : s === "active" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                            : s === "resolved" ? "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                            : "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                          : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={fetchSupportRequests}
                    disabled={queueLoading}
                    className="ml-auto p-1 rounded-lg text-content-secondary hover:text-primary dark:hover:text-primary-300 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", queueLoading && "animate-spin")} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {queueLoading && supportRequests.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-content-secondary dark:text-content-dark-secondary">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" /> Loading…
                    </div>
                  ) : filteredQueue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
                      <div className="w-10 h-10 rounded-2xl bg-surface-tertiary dark:bg-surface-dark-tertiary flex items-center justify-center">
                        <Inbox className="h-5 w-5 text-content-secondary dark:text-content-dark-secondary opacity-50" />
                      </div>
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                        {queueFilter !== "all" ? `No ${queueFilter} requests` : "Queue is empty"}
                      </p>
                    </div>
                  ) : (
                    filteredQueue.map((req) => {
                      const isActive = req.id === activeSupportId;
                      return (
                        <button
                          key={req.id}
                          onClick={() => setActiveSupportId(req.id)}
                          className={cn(
                            "w-full text-left px-3 py-3 border-b border-line dark:border-line-dark transition-colors border-l-2",
                            isActive
                              ? "bg-primary/5 dark:bg-primary-400/5 border-l-primary dark:border-l-primary-300"
                              : "hover:bg-surface-hover dark:hover:bg-surface-dark-hover border-l-transparent"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={`${req.customer.firstName} ${req.customer.lastName ?? ""}`} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-content dark:text-content-dark truncate">
                                  {req.customer.firstName} {req.customer.lastName ?? ""}
                                </p>
                                {req.machineName && (
                                  <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate">{req.machineName}</p>
                                )}
                              </div>
                            </div>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0",
                              req.status === "pending" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : req.status === "active" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                            )}>
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary line-clamp-2 ml-9">{req.problem}</p>
                          <div className="flex items-center justify-between mt-1.5 ml-9">
                            <p className="text-[11px] sm:text-[10px] text-content-tertiary dark:text-content-dark-secondary flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(new Date(req.createdAt))}
                            </p>
                            {req.status === "pending" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAcceptRequest(req.id); }}
                                disabled={acceptingId === req.id}
                                className="text-[11px] sm:text-[10px] px-2 py-0.5 rounded-lg bg-primary hover:bg-primary-600 text-white font-semibold transition-colors disabled:opacity-50"
                              >
                                {acceptingId === req.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Accept"}
                              </button>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Detail */}
              <div className={cn(
                "flex-1 flex flex-col overflow-hidden bg-surface dark:bg-surface-dark",
                showQueueDetail ? "flex" : "hidden sm:flex"
              )}>
                {!activeReq ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                      <Inbox className="h-8 w-8 text-amber-500 dark:text-amber-400 opacity-60" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-content dark:text-content-dark">No request selected</p>
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-1 max-w-xs">
                        Accept a pending request from the queue to start helping a customer.
                      </p>
                    </div>
                    {pendingCount > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm font-medium">
                        <Activity className="h-4 w-4" />
                        {pendingCount} pending {pendingCount === 1 ? "request" : "requests"} waiting
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Chat header */}
                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          onClick={() => setActiveSupportId(null)}
                          className="sm:hidden p-1.5 rounded-lg text-content-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Avatar name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`} size="sm" status={activeReq.status === "active" ? "online" : undefined} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight truncate">
                            {activeReq.customer.firstName} {activeReq.customer.lastName ?? ""}
                          </p>
                          {activeReq.machineName && (
                            <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary truncate flex items-center gap-1">
                              <Wrench className="h-2.5 w-2.5" /> {activeReq.machineName}
                            </p>
                          )}
                        </div>
                        <span className={cn(
                          "hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                          activeReq.status === "active" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                            : activeReq.status === "resolved" ? "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary"
                            : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                        )}>
                          {activeReq.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeReq.status === "active" && (
                          <Button variant="accent" size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => handleResolveSupport(activeReq.id)}>
                            <span className="hidden sm:inline">Resolve</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Problem banner */}
                    <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-500/5 border-b border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <span className="font-semibold">Problem: </span>{activeReq.problem}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                      {supportMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                          <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                            {activeReq.status === "pending" ? "Accept this request to start chatting." : "No messages yet."}
                          </p>
                        </div>
                      ) : (
                        supportMessages.map((msg) => {
                          const isEng = msg.senderId !== activeReq.customerId;
                          return (
                            <div key={msg.id} className={cn("flex gap-2.5", isEng ? "justify-end" : "justify-start")}>
                              {!isEng && (
                                <Avatar name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`} size="sm" className="mt-0.5 shrink-0" />
                              )}
                              <div className={cn("max-w-[80%] sm:max-w-[70%] space-y-1", isEng && "items-end flex flex-col")}>
                                <div className={cn(
                                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                                  isEng
                                    ? "bg-primary text-white rounded-tr-sm"
                                    : "bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark border border-line dark:border-line-dark rounded-tl-sm"
                                )}>
                                  {msg.content}
                                </div>
                                <p className="text-[11px] sm:text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
                                  {isEng ? "You" : activeReq.customer.firstName} · {formatRelativeTime(new Date(msg.createdAt))}
                                </p>
                              </div>
                              {isEng && <Avatar name={user.firstName} size="sm" className="mt-0.5 shrink-0" />}
                            </div>
                          );
                        })
                      )}
                      <div ref={supportEndRef} />
                    </div>

                    {/* Composer */}
                    <div className={cn(
                      "shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface-card dark:bg-surface-dark-card",
                      activeReq.status !== "active" && "opacity-50 pointer-events-none"
                    )}>
                      <div className="flex items-end gap-2">
                        <textarea
                          value={supportReplyText}
                          onChange={(e) => setSupportReplyText(e.target.value)}
                          onKeyDown={onKeySupport}
                          disabled={supportSending || activeReq.status !== "active"}
                          placeholder="Type a reply… (Ctrl+Enter to send)"
                          rows={2}
                          className="flex-1 resize-none rounded-xl px-3 py-2 text-base sm:text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors disabled:opacity-50"
                        />
                        <Button variant="primary" size="md" loading={supportSending} disabled={!supportReplyText.trim() || activeReq.status !== "active"} onClick={handleSendSupportMessage} icon={!supportSending ? <Send className="h-4 w-4" /> : undefined}>
                          Send
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* ANALYTICS                                              */}
          {/* ══════════════════════════════════════════════════════ */}
          {tab === "analytics" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface dark:bg-surface-dark">
              {analyticsLoading && !analytics ? (
                <div className="flex items-center justify-center h-64 text-sm text-content-secondary dark:text-content-dark-secondary">
                  <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> Loading analytics…
                </div>
              ) : !analytics ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
                  <BarChart3 className="h-10 w-10 text-content-secondary opacity-40" />
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No analytics data yet.</p>
                  <Button variant="secondary" size="sm" onClick={fetchAnalytics}>Load Analytics</Button>
                </div>
              ) : (
                <div className="space-y-6 max-w-5xl mx-auto">
                  {/* Refresh button */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-content dark:text-content-dark">Customer Analytics</h2>
                    <button
                      onClick={fetchAnalytics}
                      disabled={analyticsLoading}
                      className="flex items-center gap-1.5 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-primary dark:hover:text-primary-300 transition-colors disabled:opacity-40 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", analyticsLoading && "animate-spin")} /> Refresh
                    </button>
                  </div>

                  {/* Stats cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Conversations", value: analytics.totalConversations, icon: MessageSquare, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
                      { label: "Support Requests", value: analytics.totalSupportRequests, icon: Inbox, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
                      { label: "Resolved", value: analytics.resolvedCount, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                      { label: "Pending", value: analytics.pendingCount, icon: Clock, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-500/10" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", stat.bg)}>
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                          </div>
                        </div>
                        <p className="text-2xl font-bold text-content dark:text-content-dark">{stat.value}</p>
                        <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Top Questions & Top Complaints */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Top Questions */}
                    <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <HelpCircle className="h-4 w-4 text-blue-500" />
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Most Asked Questions</h3>
                      </div>
                      {analytics.topQuestions.length === 0 ? (
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No question data yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {analytics.topQuestions.slice(0, 8).map((q, i) => {
                            const max = analytics.topQuestions[0]?.count || 1;
                            const pct = Math.round((q.count / max) * 100);
                            return (
                              <div key={i}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-content dark:text-content-dark truncate max-w-[75%] capitalize">{q.keyword}</span>
                                  <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary font-medium">{q.count}</span>
                                </div>
                                <div className="h-1.5 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Top Complaints */}
                    <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Top Complaints</h3>
                      </div>
                      {analytics.topComplaints.length === 0 ? (
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No complaint data yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {analytics.topComplaints.slice(0, 8).map((c, i) => {
                            const max = analytics.topComplaints[0]?.count || 1;
                            const pct = Math.round((c.count / max) * 100);
                            return (
                              <div key={i}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-content dark:text-content-dark truncate max-w-[75%] capitalize">{c.keyword}</span>
                                  <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary font-medium">{c.count}</span>
                                </div>
                                <div className="h-1.5 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 30-Day Activity Timeline */}
                  <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark">30-Day Activity</h3>
                    </div>
                    <div className="flex items-end gap-[2px] h-24">
                      {analytics.timeline.map((day) => {
                        const total = day.conversations + day.support;
                        const maxVal = Math.max(...analytics.timeline.map((d) => d.conversations + d.support), 1);
                        const heightPct = Math.max((total / maxVal) * 100, 4);
                        return (
                          <div
                            key={day.date}
                            className="flex-1 bg-primary/20 dark:bg-primary-400/20 hover:bg-primary/40 dark:hover:bg-primary-400/40 rounded-t transition-colors cursor-default group relative"
                            style={{ height: `${heightPct}%` }}
                            title={`${day.date}: ${day.conversations} chats, ${day.support} support`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary">
                      <span>{analytics.timeline[0]?.date ?? ""}</span>
                      <span>{analytics.timeline[analytics.timeline.length - 1]?.date ?? ""}</span>
                    </div>
                  </div>

                  {/* Recent Issues */}
                  <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-violet-500" />
                      <h3 className="text-sm font-semibold text-content dark:text-content-dark">Recent Issues</h3>
                    </div>
                    {analytics.recentIssues.length === 0 ? (
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No recent issues.</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.recentIssues.map((issue) => (
                          <div key={issue.id} className="flex items-center justify-between gap-3 py-2 border-b border-line dark:border-line-dark last:border-b-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-content dark:text-content-dark truncate">{issue.problem}</p>
                              <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary"> {issue.customer.lastName ?? ""} · {formatRelativeTime(new Date(issue.createdAt))}
                              </p>
                            </div>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0",
                              issue.status === "pending" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : issue.status === "active" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                            )}>
                              {issue.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ── Toasts ─────────────────────────────────────────────── */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-lg text-xs font-medium pointer-events-auto border animate-in slide-in-from-right-4 fade-in duration-200",
              t.type === "success" && "bg-surface-card dark:bg-surface-dark-card text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50",
              t.type === "info" && "bg-surface-card dark:bg-surface-dark-card text-primary dark:text-primary-300 border-blue-200 dark:border-blue-700/50",
              t.type === "warning" && "bg-surface-card dark:bg-surface-dark-card text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/50"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            {t.type === "info" && <Info className="h-3.5 w-3.5 text-primary shrink-0" />}
            {t.type === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            {t.message}
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="ml-1 opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
