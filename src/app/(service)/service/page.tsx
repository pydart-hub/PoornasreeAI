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
  ChevronLeft,
  Send,
  CheckCircle2,
  Info,
  MessageSquare,
  AlertTriangle,
  X,
  Inbox,
  Zap,
  Lightbulb,
  Loader2,
  Bot,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
type Status = "open" | "in_progress" | "resolved";

interface ConversationUser { email: string; firstName: string; lastName: string | null; }
interface ApiMessage { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
interface ApiConversation { id: string; title: string | null; userId: string; createdAt: string; updatedAt: string; user: ConversationUser; messages: ApiMessage[]; }
interface SupportCustomer { id: string; firstName: string; lastName?: string | null; email: string; }
interface SupportRequestItem { id: string; customerId: string; engineerId: string | null; problem: string; machineName: string | null; status: "pending" | "active" | "resolved"; createdAt: string; customer: SupportCustomer; engineer: { id: string; firstName: string; lastName?: string } | null; _count: { chatMessages: number }; }
interface SupportChatMessage { id: string; senderId: string; content: string; createdAt: string; sender: { id: string; firstName: string; lastName?: string; role: string }; }
interface AiInsight { insights: { rank: number; score: number; snippet: string; documentId: string }[]; confidence: "high" | "medium" | "low"; suggestedChecks: string[]; }
interface Toast { id: number; message: string; type: "success" | "info" | "warning"; }

// ── Helpers ───────────────────────────────────────────────────────────
function displayName(u: ConversationUser) {
  return u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName;
}
function lastMessage(conv: ApiConversation) {
  if (!conv.messages.length) return "No messages yet";
  return truncate(conv.messages[conv.messages.length - 1].content, 60);
}
function confidenceColor(c: AiInsight["confidence"]) {
  return c === "high" ? "bg-emerald-500/20 text-emerald-400" : c === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400";
}

const STATUS_CFG: Record<Status, { label: string; variant: "warning" | "info" | "success"; dot: boolean }> = {
  open: { label: "Open", variant: "warning", dot: true },
  in_progress: { label: "In Progress", variant: "info", dot: true },
  resolved: { label: "Resolved", variant: "success", dot: false },
};

const CHAT_FILTERS: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const Q_STATUSES = ["all", "pending", "active", "resolved"] as const;

// ═════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  // Top-level tab — Support Queue is default (primary role)
  const [tab, setTab] = useState<"queue" | "chats" | "assistant">("queue");

  // ── Support Queue state ────────────────────────────────────────────
  const [supportRequests, setSupportRequests] = useState<SupportRequestItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "pending" | "active" | "resolved">("all");
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportChatMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // ── AI Insight (inline) ────────────────────────────────────────────
  const [showInsight, setShowInsight] = useState(false);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // ── AI Conversations state ─────────────────────────────────────────
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<"all" | Status>("all");
  const [chatFilterOpen, setChatFilterOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // ── KB Assistant state ─────────────────────────────────────────────
  const [kbMessages, setKbMessages] = useState<{ id: string; role: "user" | "assistant"; content: string; timestamp: Date }[]>([]);
  const [kbConvId, setKbConvId] = useState<string | null>(null);
  const [kbInput, setKbInput] = useState("");
  const [kbStreaming, setKbStreaming] = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const supportEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const kbEndRef = useRef<HTMLDivElement>(null);

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && !["service", "admin"].includes(user.role)) router.replace("/");
  }, [user, authLoading, router]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastId.current;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Socket.IO ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !["service", "admin"].includes(user.role)) return;
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

  const fetchConversations = useCallback(async () => {
    setChatLoading(true);
    try {
      const r = await fetch("/api/conversations", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      const convs: ApiConversation[] = d.conversations;
      setConversations(convs);
      setStatuses((p) => { const u = { ...p }; convs.forEach((c) => { if (!u[c.id]) u[c.id] = "open"; }); return u; });
    } catch (e) { console.error("fetchConversations:", e); }
    finally { setChatLoading(false); }
  }, []);

  useEffect(() => {
    if (user && ["service", "admin"].includes(user.role)) { fetchSupportRequests(); fetchConversations(); }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeSupportId) fetchSupportMessages(activeSupportId); }, [activeSupportId, fetchSupportMessages]);
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [supportMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeId, conversations]);
  useEffect(() => { kbEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [kbMessages]);

  // ── Derived ────────────────────────────────────────────────────────
  const filteredQueue = supportRequests.filter((r) => queueFilter === "all" || r.status === queueFilter);
  const filteredChats = conversations.filter((c) => chatFilter === "all" || (statuses[c.id] ?? "open") === chatFilter);
  const activeReq = supportRequests.find((r) => r.id === activeSupportId) ?? null;
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeStatus = activeId ? (statuses[activeId] ?? "open") : null;
  const pendingCount = supportRequests.filter((r) => r.status === "pending").length;

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
      setActiveSupportId(null); setSupportMessages([]); setShowInsight(false); setAiInsight(null);
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

  const handleGetAiInsight = async (problem: string, machineName?: string) => {
    setInsightLoading(true); setShowInsight(true);
    try {
      const r = await fetch("/api/support/ai-insight", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, machineName }),
      });
      if (!r.ok) throw new Error();
      setAiInsight(await r.json());
    } catch { addToast("AI insight unavailable", "warning"); setShowInsight(false); }
    finally { setInsightLoading(false); }
  };

  // ── AI Chat actions ────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!replyText.trim() || !activeId || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const tempMsg: ApiMessage = { id: tempId, role: "assistant", content: replyText.trim(), createdAt: new Date().toISOString() };
    setConversations((p) => p.map((c) => (c.id === activeId ? { ...c, messages: [...c.messages, tempMsg] } : c)));
    const sentText = replyText.trim();
    setReplyText("");
    try {
      const r = await fetch(`/api/conversations/${activeId}/reply`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sentText }),
      });
      if (!r.ok) throw new Error();
      const { message } = await r.json();
      setConversations((p) => p.map((c) =>
        c.id !== activeId ? c : { ...c, messages: c.messages.map((m) => (m.id === tempId ? { ...m, id: message.id, createdAt: message.createdAt } : m)) }
      ));
      if (statuses[activeId] === "open") setStatuses((p) => ({ ...p, [activeId]: "in_progress" }));
    } catch {
      setConversations((p) => p.map((c) => (c.id === activeId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)));
      setReplyText(sentText);
      addToast("Failed to send reply", "warning");
    } finally { setSending(false); }
  };

  const handleMarkResolved = () => {
    if (activeId) { setStatuses((p) => ({ ...p, [activeId]: "resolved" })); addToast("Marked resolved", "success"); }
  };

  // ── KB Assistant actions ───────────────────────────────────────────
  const handleKbSend = async () => {
    if (!kbInput.trim() || kbStreaming) return;
    setKbStreaming(true);
    const text = kbInput.trim();
    setKbInput("");
    const userMsgId = `kb-user-${Date.now()}`;
    setKbMessages((p) => [...p, { id: userMsgId, role: "user" as const, content: text, timestamp: new Date() }]);
    const botMsgId = `kb-bot-${Date.now()}`;
    setKbMessages((p) => [...p, { id: botMsgId, role: "assistant" as const, content: "", timestamp: new Date() }]);
    try {
      let convId = kbConvId;
      if (!convId) {
        const r = await fetch("/api/conversations", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text.slice(0, 50) }),
        });
        if (!r.ok) throw new Error();
        const d = await r.json();
        convId = d.conversation.id as string;
        setKbConvId(convId);
      }
      const r = await fetch("/api/messages", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, content: text }),
      });
      if (!r.ok) throw new Error();
      const { assistantMessage } = await r.json();
      const fullReply: string = assistantMessage.content;
      for (let i = 0; i <= fullReply.length; i++) {
        await new Promise((res) => setTimeout(res, 12));
        setKbMessages((p) =>
          p.map((m) =>
            m.id === botMsgId
              ? i === fullReply.length
                ? { ...m, id: assistantMessage.id, content: fullReply, timestamp: new Date(assistantMessage.createdAt) }
                : { ...m, content: fullReply.slice(0, i) }
              : m
          )
        );
      }
    } catch {
      setKbMessages((p) => p.filter((m) => m.id !== botMsgId));
      setKbInput(text);
      addToast("Failed to get AI response", "warning");
    } finally { setKbStreaming(false); }
  };

  // ── Keyboard ───────────────────────────────────────────────────────
  const onKeySupport = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSendSupportMessage(); }
  };
  const onKeyReply = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSendReply(); }
  };

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  // Mobile: if an item is selected, show full-screen detail
  const showQueueDetail = tab === "queue" && activeSupportId !== null;
  const showChatDetail = tab === "chats" && activeId !== null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-gray-950 font-sans">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 flex items-center justify-between px-3 sm:px-5 border-b border-slate-700 bg-slate-900 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Logo variant="icon" size="sm" />
          <span className="font-semibold text-slate-100 tracking-tight text-sm truncate">Service Panel</span>
          <Badge variant="info" dot className="hidden sm:inline-flex text-[10px]">
            {user.role === "admin" ? "Admin" : "Service"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden md:block text-xs text-slate-400">{user.firstName}</span>
          <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" />
          <div className="hidden sm:block"><ThemeToggle /></div>
          <button
            onClick={async () => { await logout(); router.replace("/login"); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-slate-700 bg-slate-900">
        <button
          onClick={() => { setTab("queue"); fetchSupportRequests(); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
            tab === "queue"
              ? "text-amber-400 border-b-2 border-amber-400 bg-amber-500/5"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Inbox className="h-3.5 w-3.5" />
          Support Queue
          {pendingCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab("chats"); fetchConversations(); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
            tab === "chats"
              ? "text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          AI Chats
          <span className="text-[10px] opacity-60">({conversations.length})</span>
        </button>
        <button
          onClick={() => setTab("assistant")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
            tab === "assistant"
              ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          KB Assistant
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ════════════════════════════════════════════════════════ */}
        {/* SUPPORT QUEUE TAB                                       */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab === "queue" && (
          <>
            {/* List column (hidden on mobile when detail open) */}
            <div className={cn(
              "w-full sm:w-72 md:w-80 shrink-0 flex flex-col border-r border-slate-700 bg-slate-900 overflow-hidden",
              showQueueDetail ? "hidden sm:flex" : "flex"
            )}>
              {/* Filter pills + refresh */}
              <div className="px-3 py-2.5 border-b border-slate-700 flex items-center gap-2 flex-wrap">
                {Q_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setQueueFilter(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors",
                      queueFilter === s
                        ? s === "pending" ? "bg-amber-500/20 text-amber-300"
                          : s === "active" ? "bg-emerald-500/20 text-emerald-300"
                          : s === "resolved" ? "bg-slate-500/20 text-slate-300"
                          : "bg-indigo-500/20 text-indigo-300"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={fetchSupportRequests}
                  disabled={queueLoading}
                  className="ml-auto p-1 rounded-lg text-slate-500 hover:text-amber-400 transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", queueLoading && "animate-spin")} />
                </button>
              </div>

              {/* Request cards */}
              <div className="flex-1 overflow-y-auto">
                {queueLoading && supportRequests.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin mr-2 text-amber-400" /> Loading…
                  </div>
                ) : filteredQueue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
                    <Inbox className="h-8 w-8 text-slate-600 opacity-40" />
                    <p className="text-sm text-slate-500">
                      {queueFilter !== "all" ? `No ${queueFilter} requests` : "Queue is empty"}
                    </p>
                  </div>
                ) : (
                  filteredQueue.map((req) => {
                    const isActive = req.id === activeSupportId;
                    return (
                      <button
                        key={req.id}
                        onClick={() => { setActiveSupportId(req.id); setShowInsight(false); setAiInsight(null); }}
                        className={cn(
                          "w-full text-left px-3 py-3 border-b border-slate-800 transition-colors",
                          isActive
                            ? "bg-amber-500/10 border-l-2 border-l-amber-400"
                            : "hover:bg-slate-800/60 border-l-2 border-l-transparent"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar name={`${req.customer.firstName} ${req.customer.lastName ?? ""}`} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-200 truncate">
                                {req.customer.firstName} {req.customer.lastName ?? ""}
                              </p>
                              {req.machineName && (
                                <p className="text-[10px] text-slate-500 truncate">{req.machineName}</p>
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
                        <p className="text-xs text-slate-400 line-clamp-2 ml-9">{req.problem}</p>
                        <div className="flex items-center justify-between mt-1.5 ml-9">
                          <p className="text-[10px] text-slate-600">
                            {formatRelativeTime(new Date(req.createdAt))}
                          </p>
                          {req.status === "pending" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAcceptRequest(req.id); }}
                              disabled={acceptingId === req.id}
                              className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
                            >
                              {acceptingId === req.id ? (
                                <Loader2 className="h-3 w-3 animate-spin inline" />
                              ) : "Accept"}
                            </button>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Detail column (full-width on mobile when active) */}
            <div className={cn(
              "flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-gray-950",
              showQueueDetail ? "flex" : "hidden sm:flex"
            )}>
              {!activeReq ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <Inbox className="h-7 w-7 text-amber-400 opacity-60" />
                  </div>
                  <p className="text-base font-medium text-content dark:text-content-dark">No request selected</p>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary max-w-xs">
                    Accept a pending request or select an active one.
                  </p>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="h-12 shrink-0 flex items-center justify-between px-3 sm:px-4 border-b border-line dark:border-line-dark bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setActiveSupportId(null)}
                        className="sm:hidden p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                        title="Back"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <Avatar name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight truncate">
                          {activeReq.customer.firstName} {activeReq.customer.lastName ?? ""}
                        </p>
                        {activeReq.machineName && (
                          <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate">
                            {activeReq.machineName}
                          </p>
                        )}
                      </div>
                      <span className={cn(
                        "hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                        activeReq.status === "active" ? "bg-emerald-500/20 text-emerald-400"
                          : activeReq.status === "resolved" ? "bg-slate-500/20 text-slate-400"
                          : "bg-amber-500/20 text-amber-400"
                      )}>
                        {activeReq.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          showInsight
                            ? (setShowInsight(false), setAiInsight(null))
                            : handleGetAiInsight(activeReq.problem, activeReq.machineName ?? undefined)
                        }
                        disabled={insightLoading}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
                          showInsight
                            ? "bg-amber-500/20 text-amber-300"
                            : "text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                        )}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">AI Insight</span>
                      </button>
                      {activeReq.status === "active" && (
                        <Button
                          variant="accent"
                          size="sm"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => handleResolveSupport(activeReq.id)}
                        >
                          <span className="hidden sm:inline">Resolve</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Problem banner */}
                  <div className="px-3 sm:px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 text-xs text-amber-300 leading-relaxed">
                    <span className="font-semibold">Problem: </span>{activeReq.problem}
                  </div>

                  {/* AI Insight accordion (inline — no 3rd column) */}
                  {showInsight && (
                    <div className="px-3 sm:px-4 py-3 border-b border-line dark:border-line-dark bg-slate-50 dark:bg-gray-900/50">
                      {insightLoading ? (
                        <div className="flex items-center gap-2 text-xs text-content-secondary">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> Analyzing problem…
                        </div>
                      ) : aiInsight ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-content dark:text-content-dark flex items-center gap-1.5">
                              <Lightbulb className="h-3.5 w-3.5 text-amber-400" /> AI Insight
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize",
                                confidenceColor(aiInsight.confidence)
                              )}>
                                {aiInsight.confidence}
                              </span>
                              <button
                                onClick={() => { setShowInsight(false); setAiInsight(null); }}
                                className="text-slate-500 hover:text-slate-300"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {aiInsight.suggestedChecks.length > 0 && (
                            <ul className="space-y-1">
                              {aiInsight.suggestedChecks.map((c, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-content-secondary dark:text-content-dark-secondary">
                                  <Zap className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />{c}
                                </li>
                              ))}
                            </ul>
                          )}
                          {aiInsight.insights.length > 0 && (
                            <div className="space-y-1">
                              {aiInsight.insights.map((ins) => (
                                <p
                                  key={ins.rank}
                                  className="text-[11px] bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-lg p-2 text-content-secondary dark:text-content-dark-secondary leading-relaxed line-clamp-2"
                                >
                                  {ins.snippet}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-content-secondary">No insight available.</p>
                      )}
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
                    {supportMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                        <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                          {activeReq.status === "pending" ? "Accept this request to start chatting." : "No messages yet."}
                        </p>
                      </div>
                    ) : (
                      supportMessages.map((msg) => {
                        const isEng = msg.senderId !== activeReq.customerId;
                        return (
                          <div key={msg.id} className={cn("flex gap-2", isEng ? "justify-end" : "justify-start")}>
                            {!isEng && (
                              <Avatar
                                name={`${activeReq.customer.firstName} ${activeReq.customer.lastName ?? ""}`}
                                size="sm"
                                className="mt-0.5 shrink-0"
                              />
                            )}
                            <div className={cn("max-w-[80%] sm:max-w-[70%] space-y-0.5", isEng && "items-end flex flex-col")}>
                              <div className={cn(
                                "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                                isEng
                                  ? "bg-primary text-white rounded-tr-sm"
                                  : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark rounded-tl-sm"
                              )}>
                                {msg.content}
                              </div>
                              <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
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
                    "shrink-0 border-t border-line dark:border-line-dark px-3 sm:px-4 py-2.5 bg-surface dark:bg-surface-dark",
                    activeReq.status !== "active" && "opacity-50 pointer-events-none"
                  )}>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={supportReplyText}
                        onChange={(e) => setSupportReplyText(e.target.value)}
                        onKeyDown={onKeySupport}
                        disabled={supportSending || activeReq.status !== "active"}
                        placeholder="Type a reply... (Ctrl+Enter to send)"
                        rows={2}
                        className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark placeholder:text-content-tertiary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors disabled:opacity-50"
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
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* AI CHATS TAB                                            */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab === "chats" && (
          <>
            {/* List column */}
            <div className={cn(
              "w-full sm:w-72 md:w-80 shrink-0 flex flex-col border-r border-slate-700 bg-slate-900 overflow-hidden",
              showChatDetail ? "hidden sm:flex" : "flex"
            )}>
              {/* Filter + refresh */}
              <div className="px-3 py-2.5 border-b border-slate-700 flex items-center gap-2">
                <div className="relative flex-1">
                  <button
                    onClick={() => setChatFilterOpen((v) => !v)}
                    className="w-full flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:border-indigo-400/60 transition-colors"
                  >
                    {CHAT_FILTERS.find((f) => f.value === chatFilter)?.label ?? "All"}
                    <ChevronDown className={cn("h-3 w-3 transition-transform", chatFilterOpen && "rotate-180")} />
                  </button>
                  {chatFilterOpen && (
                    <div className="absolute top-full mt-1 left-0 w-full z-20 rounded-lg border border-slate-600 bg-slate-800 shadow-lg overflow-hidden">
                      {CHAT_FILTERS.map((f) => (
                        <button
                          key={f.value}
                          onClick={() => { setChatFilter(f.value); setChatFilterOpen(false); }}
                          className={cn(
                            "w-full text-left text-[11px] px-2.5 py-1.5 transition-colors",
                            chatFilter === f.value
                              ? "bg-indigo-500/20 text-indigo-300 font-medium"
                              : "text-slate-300 hover:bg-slate-700"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={fetchConversations}
                  disabled={chatLoading}
                  className="p-1 rounded-lg text-slate-500 hover:text-indigo-400 transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", chatLoading && "animate-spin")} />
                </button>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto">
                {chatLoading && conversations.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin mr-2 text-indigo-400" /> Loading…
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
                    <MessageSquare className="h-8 w-8 text-slate-600 opacity-40" />
                    <p className="text-sm text-slate-500">No conversations</p>
                  </div>
                ) : (
                  filteredChats.map((conv) => {
                    const st = statuses[conv.id] ?? "open";
                    const cfg = STATUS_CFG[st];
                    const isActive = conv.id === activeId;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveId(conv.id)}
                        className={cn(
                          "w-full text-left px-3 py-3 border-b border-slate-800 transition-colors",
                          isActive
                            ? "bg-indigo-500/10 border-l-2 border-l-indigo-400"
                            : "hover:bg-slate-800/60 border-l-2 border-l-transparent"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar name={displayName(conv.user)} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-200 truncate">{displayName(conv.user)}</p>
                              <p className="text-[10px] text-slate-500 truncate">{conv.user.email}</p>
                            </div>
                          </div>
                          <Badge variant={cfg.variant} dot={cfg.dot} size="sm">{cfg.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 ml-9">{lastMessage(conv)}</p>
                        <p className="text-[10px] text-slate-600 mt-1 ml-9">{formatRelativeTime(new Date(conv.updatedAt))}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Detail column */}
            <div className={cn(
              "flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-gray-950",
              showChatDetail ? "flex" : "hidden sm:flex"
            )}>
              {!activeConv ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                    <MessageSquare className="h-7 w-7 text-indigo-400 opacity-60" />
                  </div>
                  <p className="text-base font-medium text-content dark:text-content-dark">No conversation selected</p>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary max-w-xs">
                    Choose a customer conversation from the list.
                  </p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="h-12 shrink-0 flex items-center justify-between px-3 sm:px-4 border-b border-line dark:border-line-dark bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setActiveId(null)}
                        className="sm:hidden p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                        title="Back"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <Avatar name={displayName(activeConv.user)} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight truncate">
                          {displayName(activeConv.user)}
                        </p>
                        <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate">
                          {activeConv.user.email}
                        </p>
                      </div>
                      {activeStatus && (
                        <Badge variant={STATUS_CFG[activeStatus].variant} dot={STATUS_CFG[activeStatus].dot} size="sm" className="hidden sm:inline-flex">
                          {STATUS_CFG[activeStatus].label}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant={activeStatus === "resolved" ? "secondary" : "accent"}
                      size="sm"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={handleMarkResolved}
                      disabled={activeStatus === "resolved"}
                    >
                      <span className="hidden sm:inline">
                        {activeStatus === "resolved" ? "Resolved" : "Mark Resolved"}
                      </span>
                    </Button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
                    {activeConv.messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                        <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No messages yet.</p>
                      </div>
                    ) : (
                      activeConv.messages.map((msg) => {
                        const isUser = msg.role === "user";
                        return (
                          <div key={msg.id} className={cn("flex gap-2", isUser ? "justify-start" : "justify-end")}>
                            {isUser && <Avatar name={displayName(activeConv.user)} size="sm" className="mt-0.5 shrink-0" />}
                            <div className={cn("max-w-[80%] sm:max-w-[70%] space-y-0.5", !isUser && "items-end flex flex-col")}>
                              <div className={cn(
                                "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
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
                            {!isUser && <Avatar name={user.firstName} size="sm" className="mt-0.5 shrink-0" />}
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply composer */}
                  <div className={cn(
                    "shrink-0 border-t border-line dark:border-line-dark px-3 sm:px-4 py-2.5 bg-surface dark:bg-surface-dark",
                    activeStatus === "resolved" && "opacity-50 pointer-events-none"
                  )}>
                    {activeStatus === "resolved" && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Conversation resolved.
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={onKeyReply}
                        disabled={sending || activeStatus === "resolved"}
                        placeholder="Type a reply... (Ctrl+Enter to send)"
                        rows={2}
                        className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark placeholder:text-content-tertiary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors disabled:opacity-50"
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
          </>
        )}
        {/* ════════════════════════════════════════════════════════ */}
        {/* KB ASSISTANT TAB                                        */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab === "assistant" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-line dark:border-line-dark bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight">KB Assistant</p>
                  <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary">Based on service documentation trained by admin</p>
                </div>
              </div>
              <button
                onClick={() => { setKbMessages([]); setKbConvId(null); }}
                disabled={kbMessages.length === 0 || kbStreaming}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30"
              >
                <RefreshCw className="h-3 w-3" /> New chat
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50 dark:bg-gray-950">
              {kbMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <Bot className="h-8 w-8 text-emerald-400 opacity-70" />
                  </div>
                  <div>
                    <p className="font-semibold text-content dark:text-content-dark">Service Knowledge Base</p>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-1 max-w-xs">
                      Ask anything about troubleshooting, maintenance, or technical procedures. Replies are based only on documents your admin has uploaded for service engineers.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                    {["How to calibrate the machine?", "Error code E02", "Cleaning procedure", "Daily maintenance steps"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setKbInput(s)}
                        className="text-[11px] px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                kbMessages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id} className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                      )}
                      <div className={cn("max-w-[85%] sm:max-w-[75%] space-y-0.5", isUser && "items-end flex flex-col")}>
                        <div className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                          isUser
                            ? "bg-primary text-white rounded-tr-sm"
                            : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark rounded-tl-sm"
                        )}>
                          {msg.content || (
                            <span className="flex items-center gap-2 text-content-secondary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> Thinking…
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
                          {isUser ? "You" : "KB Assistant"} · {formatRelativeTime(msg.timestamp)}
                        </p>
                      </div>
                      {isUser && <Avatar name={user.firstName} size="sm" className="mt-0.5 shrink-0" />}
                    </div>
                  );
                })
              )}
              <div ref={kbEndRef} />
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface dark:bg-surface-dark">
              <div className="flex items-end gap-2">
                <textarea
                  value={kbInput}
                  onChange={(e) => setKbInput(e.target.value)}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleKbSend(); } }}
                  disabled={kbStreaming}
                  placeholder="Ask about troubleshooting, error codes, maintenance… (Ctrl+Enter to send)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface-tertiary dark:bg-surface-dark-tertiary text-content dark:text-content-dark placeholder:text-content-tertiary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors disabled:opacity-50"
                />
                <Button
                  variant="primary"
                  size="md"
                  loading={kbStreaming}
                  disabled={!kbInput.trim()}
                  onClick={handleKbSend}
                  icon={!kbStreaming ? <Send className="h-4 w-4" /> : undefined}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}      </div>

      {/* ── Toasts ─────────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg text-xs font-medium pointer-events-auto border animate-in slide-in-from-right-4 fade-in duration-200",
              t.type === "success" && "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50",
              t.type === "info" && "bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700/50",
              t.type === "warning" && "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/50"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {t.type === "info" && <Info className="h-3.5 w-3.5 shrink-0" />}
            {t.type === "warning" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {t.message}
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="ml-1 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
