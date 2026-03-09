"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingScreen } from "@/components/ui/Loading";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { getSocket, closeSocket } from "@/lib/socket-client";
import {
  LogOut,
  RefreshCw,
  ChevronDown,
  Send,
  CheckCircle2,
  Info,
  MessageSquare,
  Users,
  SlidersHorizontal,
  AlertTriangle,
  X,
  Inbox,
  Zap,
  Lightbulb,
  Loader2,
} from "lucide-react";

type Status = "open" | "in_progress" | "resolved";

interface ConversationUser {
  email: string;
  firstName: string;
  lastName: string | null;
}

interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ApiConversation {
  id: string;
  title: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: ConversationUser;
  messages: ApiMessage[];
}

interface SupportCustomer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
}

interface SupportRequestItem {
  id: string;
  customerId: string;
  engineerId: string | null;
  problem: string;
  machineName: string | null;
  status: "pending" | "active" | "resolved";
  createdAt: string;
  customer: SupportCustomer;
  engineer: { id: string; firstName: string; lastName?: string } | null;
  _count: { chatMessages: number };
}

interface SupportChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName?: string; role: string };
}

interface AiInsight {
  insights: { rank: number; score: number; snippet: string; documentId: string }[];
  confidence: "high" | "medium" | "low";
  suggestedChecks: string[];
}

function confidenceColor(c: AiInsight["confidence"]) {
  return c === "high" ? "bg-emerald-500/20 text-emerald-400"
    : c === "medium" ? "bg-amber-500/20 text-amber-400"
    : "bg-red-500/20 text-red-400";
}

// ── Status config ─────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Status, { label: string; variant: "warning" | "info" | "success"; dot: boolean }> = {
  open:        { label: "Open",        variant: "warning", dot: true },
  in_progress: { label: "In Progress", variant: "info",    dot: true },
  resolved:    { label: "Resolved",    variant: "success", dot: false },
};

const FILTER_OPTIONS: { value: "all" | Status; label: string }[] = [
  { value: "all",         label: "All Conversations" },
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved",    label: "Resolved" },
];

// ── Helpers ───────────────────────────────────────────────────────────
function displayName(u: ConversationUser): string {
  return u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName;
}

function lastMessage(conv: ApiConversation): string {
  if (conv.messages.length === 0) return "No messages yet";
  const last = conv.messages[conv.messages.length - 1];
  return truncate(last.content, 60);
}

// ── Toast notification (lightweight, no external lib) ─────────────────
interface Toast {
  id: number;
  message: string;
  type: "success" | "info" | "warning";
}

// ═════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  // ── AI Conversations state (existing) ─────────────────────────────
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [escalated, setEscalated] = useState<Set<string>>(new Set());

  // ── Support Queue state (new) ──────────────────────────────────────
  const [mainView, setMainView] = useState<"chats" | "queue">("chats");
  const [supportRequests, setSupportRequests] = useState<SupportRequestItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "pending" | "active" | "resolved">("all");
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportChatMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // ── AI Insight panel (Feature 6) ──────────────────────────────────
  const [showInsight, setShowInsight] = useState(false);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const toastId          = useRef(0);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const supportEndRef    = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);

  // ── Auth guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    } else if (!authLoading && user && !["service", "admin"].includes(user.role)) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  // ── Toast helper ──────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Socket.IO: track support queue in real-time ───────────────────
  useEffect(() => {
    if (!user || !["service", "admin"].includes(user.role)) return;
    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });

    sock.on("request:new", (req: SupportRequestItem) => {
      setSupportRequests((prev) => [req, ...prev]);
      addToast(`New support request from ${req.customer.firstName}`, "info");
    });
    sock.on("request:updated", (req: SupportRequestItem) => {
      setSupportRequests((prev) =>
        prev.map((r) => r.id === req.id ? req : r)
      );
    });
    sock.on("chat:message", ({ requestId, message }: { requestId: string; message: SupportChatMessage }) => {
      if (activeSupportId === requestId) {
        setSupportMessages((prev) => [...prev, message]);
      }
    });

    return () => {
      sock.off("request:new");
      sock.off("request:updated");
      sock.off("chat:message");
      closeSocket();
    };
  }, [user, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join support request socket room when selected ────────────────
  useEffect(() => {
    if (!activeSupportId || !user) return;
    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });
    sock.emit("support:join", activeSupportId);
    return () => { sock.emit("support:leave", activeSupportId); };
  }, [activeSupportId, user]);

  // ── Load AI conversations ─────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const convs: ApiConversation[] = data.conversations;
      setConversations(convs);
      setStatuses((prev) => {
        const updated = { ...prev };
        convs.forEach((c) => { if (!updated[c.id]) updated[c.id] = "open"; });
        return updated;
      });
      if (convs.length > 0 && !activeId) setActiveId(convs[0].id);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  // ── Load support requests ─────────────────────────────────────────
  const fetchSupportRequests = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/support/requests", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSupportRequests(data.requests);
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // ── Load support chat messages ────────────────────────────────────
  const fetchSupportMessages = useCallback(async (requestId: string) => {
    try {
      const res = await fetch(`/api/support/requests/${requestId}/messages`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSupportMessages(data.messages);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (user && ["service", "admin"].includes(user.role)) {
      fetchConversations();
      fetchSupportRequests();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSupportId) fetchSupportMessages(activeSupportId);
  }, [activeSupportId, fetchSupportMessages]);

  // ── Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeId, conversations]);
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages]);

  // ── Derived state ─────────────────────────────────────────────────
  const filtered = conversations.filter((c) => {
    if (filter === "all") return true;
    return (statuses[c.id] ?? "open") === filter;
  });

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeStatus = activeId ? (statuses[activeId] ?? "open") : null;

  // ── Support queue actions ─────────────────────────────────────────
  const handleAcceptRequest = async (requestId: string) => {
    setAcceptingId(requestId);
    try {
      const res = await fetch(`/api/support/requests/${requestId}/accept`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to accept");
      const data = await res.json();
      setSupportRequests((prev) =>
        prev.map((r) => r.id === requestId ? data.request : r)
      );
      setActiveSupportId(requestId);
      setMainView("queue");
      addToast("Support request accepted", "success");
    } catch {
      addToast("Failed to accept request", "warning");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleResolveSupport = async (requestId: string) => {
    try {
      const res = await fetch(`/api/support/requests/${requestId}/resolve`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSupportRequests((prev) =>
        prev.map((r) => r.id === requestId ? data.request : r)
      );
      setActiveSupportId(null);
      setSupportMessages([]);
      setShowInsight(false);
      setAiInsight(null);
      addToast("Support request resolved", "success");
    } catch {
      addToast("Failed to resolve request", "warning");
    }
  };

  const handleSendSupportMessage = async () => {
    if (!supportReplyText.trim() || !activeSupportId || supportSending) return;
    setSupportSending(true);
    const text = supportReplyText.trim();
    setSupportReplyText("");
    try {
      const res = await fetch(`/api/support/requests/${activeSupportId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSupportMessages((prev) => [...prev, data.message]);
    } catch {
      setSupportReplyText(text);
      addToast("Failed to send message", "warning");
    } finally {
      setSupportSending(false);
    }
  };

  const handleGetAiInsight = async (problem: string, machineName?: string) => {
    setInsightLoading(true);
    setShowInsight(true);
    try {
      const res = await fetch("/api/support/ai-insight", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, machineName }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiInsight(data);
    } catch {
      addToast("AI insight unavailable", "warning");
      setShowInsight(false);
    } finally {
      setInsightLoading(false);
    }
  };

  const handleSupportKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendSupportMessage();
    }
  };

  // ── Actions ───────────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!replyText.trim() || !activeId || sending) return;
    setSending(true);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ApiMessage = {
      id: tempId,
      role: "assistant",
      content: replyText.trim(),
      createdAt: new Date().toISOString(),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, messages: [...c.messages, tempMsg] } : c
      )
    );
    const sentText = replyText.trim();
    setReplyText("");

    try {
      const res = await fetch(`/api/conversations/${activeId}/reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sentText }),
      });
      if (!res.ok) throw new Error("Failed to send");
      const { message } = await res.json();
      // Replace temp with persisted
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== activeId
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? { ...m, id: message.id, createdAt: message.createdAt } : m
                ),
              }
        )
      );
      // Auto-advance status to in_progress
      if (statuses[activeId] === "open") {
        setStatuses((prev) => ({ ...prev, [activeId]: "in_progress" }));
      }
    } catch {
      // Rollback
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) }
            : c
        )
      );
      setReplyText(sentText);
      addToast("Failed to send reply. Please try again.", "warning");
    } finally {
      setSending(false);
    }
  };

  const handleMarkResolved = () => {
    if (!activeId) return;
    setStatuses((prev) => ({ ...prev, [activeId]: "resolved" }));
    addToast("Conversation marked as resolved.", "success");
  };

  const handleEscalate = () => {
    if (!activeId) return;
    setEscalated((prev) => new Set(prev).add(activeId));
    setStatuses((prev) => ({ ...prev, [activeId]: "in_progress" }));
    addToast("Escalated to R&D team.", "info");
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  // ── Keyboard: Ctrl+Enter to send ─────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendReply();
    }
  };

  // ── Render guards ─────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-gray-950 font-sans">

      {/* ── Top Nav ──────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-slate-700 bg-slate-900 z-10">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size="sm" />
          <span className="font-semibold text-slate-100 tracking-tight">
            Service Operations Panel
          </span>
          <Badge variant="info" dot>
            {user.role === "admin" ? "Admin View" : "Service View"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-sm text-slate-400 mr-1">
            {user.firstName} {user.lastName ?? ""}
          </span>
          <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" />
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="ml-1 p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ Left Sidebar ════════════════════════════════════════ */}
        <aside className="w-80 shrink-0 flex flex-col border-r border-slate-700 bg-slate-900 overflow-hidden">

          {/* Tab switcher */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setMainView("chats")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
                mainView === "chats"
                  ? "text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" /> AI Chats
              <span className="text-[10px] opacity-60">({filtered.length})</span>
            </button>
            <button
              onClick={() => { setMainView("queue"); fetchSupportRequests(); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors",
                mainView === "queue"
                  ? "text-amber-400 border-b-2 border-amber-400 bg-amber-500/5"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Inbox className="h-3.5 w-3.5" /> Support Queue
              {supportRequests.filter((r) => r.status === "pending").length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                  {supportRequests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </button>
          </div>

          {mainView === "chats" ? (
            <>
              {/* Chat filter header */}
              <div className="px-4 py-3 border-b border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Users className="h-3.5 w-3.5 text-indigo-400" />
                    Conversations
                  </div>
                  <button
                    onClick={fetchConversations}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-40"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  </button>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setFilterOpen((v) => !v)}
                    className="w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:border-indigo-400/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3 w-3" />
                      {FILTER_OPTIONS.find((f) => f.value === filter)?.label}
                    </span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", filterOpen && "rotate-180")} />
                  </button>
                  {filterOpen && (
                    <div className="absolute top-full mt-1 left-0 w-full z-20 rounded-xl border border-slate-600 bg-slate-800 shadow-lg shadow-black/40 overflow-hidden">
                      {FILTER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setFilter(opt.value); setFilterOpen(false); }}
                          className={cn(
                            "w-full text-left text-xs px-3 py-2 transition-colors",
                            filter === opt.value
                              ? "bg-indigo-500/20 text-indigo-300 font-medium"
                              : "text-slate-300 hover:bg-slate-700"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-sm text-slate-500">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2 text-indigo-400" /> Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-6">
                    <MessageSquare className="h-8 w-8 text-slate-600 opacity-70" />
                    <p className="text-sm text-slate-500">No conversations</p>
                  </div>
                ) : (
                  filtered.map((conv) => {
                    const status: Status = statuses[conv.id] ?? "open";
                    const cfg = STATUS_CONFIG[status];
                    const isActive = conv.id === activeId;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveId(conv.id)}
                        className={cn(
                          "w-full text-left px-4 py-3 border-b border-slate-700/60 transition-colors",
                          isActive
                            ? "bg-indigo-500/10 border-l-2 border-l-indigo-400"
                            : "hover:bg-slate-800 border-l-2 border-l-transparent"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar name={displayName(conv.user)} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-200 truncate max-w-[120px]">
                                {displayName(conv.user)}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                                {conv.user.email}
                              </p>
                            </div>
                          </div>
                          <Badge variant={cfg.variant} dot={cfg.dot} size="sm">{cfg.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-1 ml-10">
                          {lastMessage(conv)}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-1.5 ml-10">
                          {formatRelativeTime(new Date(conv.updatedAt))}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              {/* Queue filter */}
              <div className="px-4 py-3 border-b border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Filter by status</span>
                  <button
                    onClick={fetchSupportRequests}
                    disabled={queueLoading}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", queueLoading && "animate-spin")} />
                  </button>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(["all", "pending", "active", "resolved"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setQueueFilter(s)}
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium transition-colors capitalize",
                        queueFilter === s
                          ? s === "pending" ? "bg-amber-500/20 text-amber-300"
                            : s === "active" ? "bg-emerald-500/20 text-emerald-300"
                            : s === "resolved" ? "bg-slate-500/20 text-slate-300"
                            : "bg-indigo-500/20 text-indigo-300"
                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Support request list */}
              <div className="flex-1 overflow-y-auto">
                {queueLoading ? (
                  <div className="flex items-center justify-center h-32 text-sm text-slate-500">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2 text-amber-400" /> Loading…
                  </div>
                ) : supportRequests.filter((r) => queueFilter === "all" || r.status === queueFilter).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-6">
                    <Inbox className="h-8 w-8 text-slate-600 opacity-70" />
                    <p className="text-sm text-slate-500">No {queueFilter !== "all" ? queueFilter : ""} requests</p>
                  </div>
                ) : (
                  supportRequests
                    .filter((r) => queueFilter === "all" || r.status === queueFilter)
                    .map((req) => {
                      const isActive = req.id === activeSupportId;
                      return (
                        <button
                          key={req.id}
                          onClick={() => { setActiveSupportId(req.id); setShowInsight(false); setAiInsight(null); }}
                          className={cn(
                            "w-full text-left px-4 py-3 border-b border-slate-700/60 transition-colors",
                            isActive
                              ? "bg-amber-500/10 border-l-2 border-l-amber-400"
                              : "hover:bg-slate-800 border-l-2 border-l-transparent"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={`${req.customer.firstName} ${req.customer.lastName ?? ""}`} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate max-w-[110px]">
                                  {req.customer.firstName} {req.customer.lastName ?? ""}
                                </p>
                                {req.machineName && (
                                  <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                    {req.machineName}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0",
                              req.status === "pending" ? "bg-amber-500/20 text-amber-300"
                                : req.status === "active" ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-slate-600/40 text-slate-400"
                            )}>
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1 ml-10">{req.problem}</p>
                          <div className="flex items-center justify-between mt-2 ml-10">
                            <p className="text-[10px] text-slate-600">
                              {formatRelativeTime(new Date(req.createdAt))}
                            </p>
                            {req.status === "pending" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAcceptRequest(req.id); }}
                                disabled={acceptingId === req.id}
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
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
            </>
          )}
        </aside>

        {/* ═══ Main Panel ══════════════════════════════════════════ */}
        <main className="flex-1 flex overflow-hidden">

          {/* ── AI Chat view ── */}
          {mainView === "chats" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {!activeConv ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-1">
                    <MessageSquare className="h-7 w-7 text-indigo-400 opacity-70" />
                  </div>
                  <p className="text-base font-medium text-content dark:text-content-dark">No conversation selected</p>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary max-w-xs">
                    Choose a customer conversation from the panel on the left.
                  </p>
                </div>
              ) : (
                <>
                  {/* Panel header */}
                  <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-line dark:border-line-dark bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-3">
                      <Avatar name={displayName(activeConv.user)} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
                          {displayName(activeConv.user)}
                        </p>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                          {activeConv.user.email}
                        </p>
                      </div>
                      {activeStatus && (
                        <Badge variant={STATUS_CONFIG[activeStatus].variant} dot={STATUS_CONFIG[activeStatus].dot}>
                          {STATUS_CONFIG[activeStatus].label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={activeStatus === "resolved" ? "secondary" : "accent"}
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={handleMarkResolved}
                        disabled={activeStatus === "resolved"}
                      >
                        {activeStatus === "resolved" ? "Resolved" : "Mark Resolved"}
                      </Button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {activeConv.messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                        <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No messages yet.</p>
                      </div>
                    ) : (
                      activeConv.messages.map((msg) => {
                        const isUser = msg.role === "user";
                        return (
                          <div key={msg.id} className={cn("flex gap-3", isUser ? "justify-start" : "justify-end")}>
                            {isUser && <Avatar name={displayName(activeConv.user)} size="sm" className="mt-0.5" />}
                            <div className={cn("max-w-[70%] space-y-1", !isUser && "items-end flex flex-col")}>
                              <div className={cn(
                                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                                isUser
                                  ? "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark rounded-tl-sm"
                                  : "bg-primary text-white rounded-tr-sm"
                              )}>
                                {msg.content}
                              </div>
                              <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
                                {isUser ? activeConv.user.firstName : "You"} · {formatRelativeTime(new Date(msg.createdAt))}
                              </p>
                            </div>
                            {!isUser && <Avatar name={user.firstName} size="sm" className="mt-0.5" />}
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply composer */}
                  <div className={cn(
                    "shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface dark:bg-surface-dark",
                    activeStatus === "resolved" && "opacity-60 pointer-events-none"
                  )}>
                    {activeStatus === "resolved" && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        This conversation has been resolved.
                      </div>
                    )}
                    <div className="flex items-end gap-3">
                      <textarea
                        ref={textareaRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sending || activeStatus === "resolved"}
                        placeholder="Type a reply… (Ctrl+Enter to send)"
                        rows={3}
                        className={cn(
                          "flex-1 resize-none rounded-xl px-4 py-2.5 text-sm",
                          "bg-surface-tertiary dark:bg-surface-dark-tertiary",
                          "text-content dark:text-content-dark",
                          "placeholder:text-content-tertiary dark:placeholder:text-content-dark-secondary",
                          "border border-line dark:border-line-dark",
                          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:focus:border-primary-400",
                          "transition-colors disabled:opacity-50"
                        )}
                      />
                      <Button
                        variant="primary"
                        size="md"
                        loading={sending}
                        disabled={!replyText.trim() || activeStatus === "resolved"}
                        onClick={handleSendReply}
                        icon={!sending ? <Send className="h-4 w-4" /> : undefined}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Support Queue view ── */}
          {mainView === "queue" && (
            <div className="flex-1 flex overflow-hidden">
              {/* Support chat column */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {!activeSupportId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-1">
                      <Inbox className="h-7 w-7 text-amber-400 opacity-70" />
                    </div>
                    <p className="text-base font-medium text-content dark:text-content-dark">No request selected</p>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary max-w-xs">
                      Accept a pending request or select an active one from the queue.
                    </p>
                  </div>
                ) : (() => {
                  const activeReq = supportRequests.find((r) => r.id === activeSupportId);
                  return activeReq ? (
                    <>
                      {/* Support chat header */}
                      <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-line dark:border-line-dark bg-white dark:bg-gray-900">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`} size="sm" />
                          <div>
                            <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
                              {activeReq.customer.firstName} {activeReq.customer.lastName ?? ""}
                            </p>
                            {activeReq.machineName && (
                              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                                Machine: {activeReq.machineName}
                              </p>
                            )}
                          </div>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                            activeReq.status === "active" ? "bg-emerald-500/20 text-emerald-400"
                              : activeReq.status === "resolved" ? "bg-slate-500/20 text-slate-400"
                              : "bg-amber-500/20 text-amber-400"
                          )}>
                            {activeReq.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Lightbulb className="h-3.5 w-3.5" />}
                            onClick={() => handleGetAiInsight(activeReq.problem, activeReq.machineName ?? undefined)}
                            disabled={insightLoading}
                          >
                            AI Insight
                          </Button>
                          {activeReq.status === "active" && (
                            <Button
                              variant="accent"
                              size="sm"
                              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              onClick={() => handleResolveSupport(activeReq.id)}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Problem banner */}
                      <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/20 text-xs text-amber-300">
                        <span className="font-semibold">Problem: </span>{activeReq.problem}
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {supportMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                            <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                            <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                              {activeReq.status === "pending" ? "Accept this request to start chatting." : "No messages yet."}
                            </p>
                          </div>
                        ) : (
                          supportMessages.map((msg) => {
                            const isEngineer = msg.senderId !== activeReq.customerId;
                            return (
                              <div key={msg.id} className={cn("flex gap-3", isEngineer ? "justify-end" : "justify-start")}>
                                {!isEngineer && (
                                  <Avatar name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`} size="sm" className="mt-0.5" />
                                )}
                                <div className={cn("max-w-[70%] space-y-1", isEngineer && "items-end flex flex-col")}>
                                  <div className={cn(
                                    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                                    isEngineer
                                      ? "bg-primary text-white rounded-tr-sm"
                                      : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark rounded-tl-sm"
                                  )}>
                                    {msg.content}
                                  </div>
                                  <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
                                    {isEngineer ? "You" : activeReq.customer.firstName} · {formatRelativeTime(new Date(msg.createdAt))}
                                  </p>
                                </div>
                                {isEngineer && <Avatar name={user.firstName} size="sm" className="mt-0.5" />}
                              </div>
                            );
                          })
                        )}
                        <div ref={supportEndRef} />
                      </div>

                      {/* Reply composer */}
                      <div className={cn(
                        "shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface dark:bg-surface-dark",
                        activeReq.status !== "active" && "opacity-50 pointer-events-none"
                      )}>
                        <div className="flex items-end gap-3">
                          <textarea
                            value={supportReplyText}
                            onChange={(e) => setSupportReplyText(e.target.value)}
                            onKeyDown={handleSupportKeyDown}
                            disabled={supportSending || activeReq.status !== "active"}
                            placeholder="Reply to customer… (Ctrl+Enter to send)"
                            rows={2}
                            className={cn(
                              "flex-1 resize-none rounded-xl px-4 py-2.5 text-sm",
                              "bg-surface-tertiary dark:bg-surface-dark-tertiary",
                              "text-content dark:text-content-dark",
                              "placeholder:text-content-tertiary dark:placeholder:text-content-dark-secondary",
                              "border border-line dark:border-line-dark",
                              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                              "transition-colors disabled:opacity-50"
                            )}
                          />
                          <Button
                            variant="primary"
                            size="md"
                            loading={supportSending}
                            disabled={!supportReplyText.trim() || activeReq.status !== "active"}
                            onClick={handleSendSupportMessage}
                            icon={!supportSending ? <Send className="h-4 w-4" /> : undefined}
                          >
                            Send
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null;
                })()}
              </div>

              {/* AI Insight panel (collapsible right column) */}
              {showInsight && (
                <div className="w-80 shrink-0 flex flex-col border-l border-line dark:border-line-dark bg-surface dark:bg-surface-dark overflow-hidden">
                  <div className="h-14 flex items-center justify-between px-4 border-b border-line dark:border-line-dark">
                    <div className="flex items-center gap-2 text-sm font-semibold text-content dark:text-content-dark">
                      <Lightbulb className="h-4 w-4 text-amber-400" />
                      AI Insight
                    </div>
                    <button
                      onClick={() => { setShowInsight(false); setAiInsight(null); }}
                      className="p-1.5 rounded-lg text-content-tertiary hover:text-content dark:hover:text-content-dark hover:bg-surface-tertiary dark:hover:bg-surface-dark-tertiary transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {insightLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-sm text-content-secondary">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> Analyzing…
                      </div>
                    ) : aiInsight ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Confidence</span>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full capitalize", confidenceColor(aiInsight.confidence))}>
                            {aiInsight.confidence}
                          </span>
                        </div>

                        {aiInsight.suggestedChecks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-content dark:text-content-dark mb-1.5">Suggested Checks</p>
                            <ul className="space-y-1">
                              {aiInsight.suggestedChecks.map((check, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                                  <Zap className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                                  {check}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiInsight.insights.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-content dark:text-content-dark mb-1.5">Relevant Snippets</p>
                            <ul className="space-y-1.5">
                              {aiInsight.insights.map((ins) => (
                                <li key={ins.rank} className="text-xs bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-lg p-2.5 text-content-secondary dark:text-content-dark-secondary leading-relaxed line-clamp-3">
                                  {ins.snippet}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary text-center mt-8">
                        No insight available.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Toast notifications ───────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto",
              "border animate-in slide-in-from-right-4 fade-in duration-200",
              t.type === "success" && "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50",
              t.type === "info"    && "bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700/50",
              t.type === "warning" && "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/50"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {t.type === "info"    && <Info  className="h-4 w-4 shrink-0" />}
            {t.type === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {t.message}
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-1 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
