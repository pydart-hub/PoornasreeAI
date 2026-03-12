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
  PanelLeftClose,
  PanelLeft,
  Menu,
  Wrench,
  Clock,
  Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type Status = "open" | "in_progress" | "resolved";

interface ConversationUser { email: string; firstName: string; lastName: string | null; }
interface ApiMessage { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
interface ApiConversation { id: string; title: string | null; userId: string; createdAt: string; updatedAt: string; user: ConversationUser; messages: ApiMessage[]; }
interface SupportCustomer { id: string; firstName: string; lastName?: string | null; email: string; }
interface SupportRequestItem { id: string; customerId: string; engineerId: string | null; problem: string; machineName: string | null; status: "pending" | "active" | "resolved"; createdAt: string; customer: SupportCustomer; engineer: { id: string; firstName: string; lastName?: string } | null; _count: { chatMessages: number }; }
interface SupportChatMessage { id: string; senderId: string; content: string; createdAt: string; sender: { id: string; firstName: string; lastName?: string; role: string }; }
interface AiInsight { insights: { rank: number; score: number; snippet: string; documentId: string }[]; confidence: "high" | "medium" | "low"; suggestedChecks: string[]; }
interface Toast { id: number; message: string; type: "success" | "info" | "warning"; }

// ── Helpers ────────────────────────────────────────────────────────────
function displayName(u: ConversationUser) {
  return u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName;
}
function lastMessage(conv: ApiConversation) {
  if (!conv.messages.length) return "No messages yet";
  return truncate(conv.messages[conv.messages.length - 1].content, 60);
}
function confidenceColor(c: AiInsight["confidence"]) {
  return c === "high" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
    : c === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30"
    : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30";
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_CFG: Record<Status, { label: string; variant: "warning" | "info" | "success" }> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In Progress", variant: "info" },
  resolved: { label: "Resolved", variant: "success" },
};

const CHAT_FILTERS: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const Q_STATUSES = ["all", "pending", "active", "resolved"] as const;

const NAV_ITEMS = [
  { id: "queue" as const, icon: Inbox, label: "Support Queue" },
  { id: "chats" as const, icon: MessageSquare, label: "AI Chats" },
  { id: "assistant" as const, icon: Bot, label: "KB Assistant" },
];

// ═══════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
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

  // ── Responsive ─────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  // ── KB Assistant ───────────────────────────────────────────────────
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
    <div className="h-screen flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SIDEBAR                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <aside
        className={cn(
          "flex flex-col h-full bg-surface-sidebar dark:bg-surface-dark-sidebar border-r border-line dark:border-line-dark transition-all duration-300 ease-in-out shrink-0",
          isMobile ? "fixed inset-y-0 left-0 z-40 w-[240px]" : "relative",
          !sidebarOpen && (isMobile ? "-translate-x-full" : "w-0 overflow-hidden border-r-0"),
          sidebarOpen && "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark shrink-0">
          <Logo variant="full" size="sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="px-3 py-3 border-b border-line dark:border-line-dark">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
              <p className="text-[10px] text-amber-700 dark:text-amber-500 font-medium">Pending</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-500 font-medium">Active</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary px-2 mb-2">
            Workspace
          </p>
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const isActive = tab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "queue") fetchSupportRequests();
                  if (id === "chats") fetchConversations();
                  if (isMobile) setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {id === "queue" && pendingCount > 0 && (
                  <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{pendingCount}</span>
                )}
                {id === "chats" && (
                  <span className="text-[10px] bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                    {conversations.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User profile */}
        <div className="shrink-0 border-t border-line dark:border-line-dark p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
            <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                {user.firstName} {user.lastName ?? ""}
              </p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{user.email}</p>
            </div>
            <button
              onClick={async () => { await logout(); router.replace("/login"); }}
              className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Sidebar backdrop (mobile) */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN                                                       */}
      {/* ══════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── Sticky header ─────────────────────────────────────── */}
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
              {tab === "queue" && "Support Queue"}
              {tab === "chats" && "Customer AI Chats"}
              {tab === "assistant" && "KB Assistant"}
            </h1>
            <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary">
              {getGreeting()}, {user.firstName}
            </p>
          </div>
          <Badge variant="info" dot>
            {user.role === "admin" ? "Admin" : "Service Engineer"}
          </Badge>
        </header>

        {/* ── Content area ──────────────────────────────────────── */}
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
                        "px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize transition-colors",
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
                          onClick={() => { setActiveSupportId(req.id); setShowInsight(false); setAiInsight(null); }}
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
                            <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(new Date(req.createdAt))}
                            </p>
                            {req.status === "pending" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAcceptRequest(req.id); }}
                                disabled={acceptingId === req.id}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-primary hover:bg-primary-600 text-white font-semibold transition-colors disabled:opacity-50"
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
                            <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate flex items-center gap-1">
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
                        <button
                          onClick={() =>
                            showInsight
                              ? (setShowInsight(false), setAiInsight(null))
                              : handleGetAiInsight(activeReq.problem, activeReq.machineName ?? undefined)
                          }
                          disabled={insightLoading}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                            showInsight
                              ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                              : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                          )}
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">AI Insight</span>
                        </button>
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

                    {/* AI Insight accordion */}
                    {showInsight && (
                      <div className="px-4 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                        {insightLoading ? (
                          <div className="flex items-center gap-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" /> Analyzing problem…
                          </div>
                        ) : aiInsight ? (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-content dark:text-content-dark flex items-center gap-1.5">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> AI Insight
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", confidenceColor(aiInsight.confidence))}>
                                  {aiInsight.confidence}
                                </span>
                                <button onClick={() => { setShowInsight(false); setAiInsight(null); }} className="text-content-secondary hover:text-content transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {aiInsight.suggestedChecks.length > 0 && (
                              <ul className="space-y-1">
                                {aiInsight.suggestedChecks.map((c, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-content-secondary dark:text-content-dark-secondary">
                                    <Zap className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />{c}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {aiInsight.insights.map((ins) => (
                              <p key={ins.rank} className="text-[11px] bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-xl p-2.5 text-content-secondary dark:text-content-dark-secondary leading-relaxed line-clamp-3">
                                {ins.snippet}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No insight available.</p>
                        )}
                      </div>
                    )}

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
                          className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors disabled:opacity-50"
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
          {/* AI CHATS                                               */}
          {/* ══════════════════════════════════════════════════════ */}
          {tab === "chats" && (
            <>
              {/* List */}
              <div className={cn(
                "w-full sm:w-72 md:w-80 shrink-0 flex flex-col border-r border-line dark:border-line-dark bg-surface-sidebar dark:bg-surface-dark-sidebar overflow-hidden",
                showChatDetail ? "hidden sm:flex" : "flex"
              )}>
                <div className="px-3 py-2.5 border-b border-line dark:border-line-dark flex items-center gap-2 bg-surface dark:bg-surface-dark">
                  <div className="relative flex-1">
                    <button
                      onClick={() => setChatFilterOpen((v) => !v)}
                      className="w-full flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark hover:border-primary/40 transition-colors"
                    >
                      {CHAT_FILTERS.find((f) => f.value === chatFilter)?.label ?? "All"}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-content-secondary", chatFilterOpen && "rotate-180")} />
                    </button>
                    {chatFilterOpen && (
                      <div className="absolute top-full mt-1 left-0 w-full z-20 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card shadow-lg overflow-hidden">
                        {CHAT_FILTERS.map((f) => (
                          <button
                            key={f.value}
                            onClick={() => { setChatFilter(f.value); setChatFilterOpen(false); }}
                            className={cn(
                              "w-full text-left text-xs px-3 py-2 transition-colors",
                              chatFilter === f.value ? "bg-primary/5 dark:bg-primary-400/5 text-primary dark:text-primary-300 font-semibold" : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={fetchConversations} disabled={chatLoading} className="p-1 rounded-lg text-content-secondary hover:text-primary dark:hover:text-primary-300 transition-colors disabled:opacity-40">
                    <RefreshCw className={cn("h-3.5 w-3.5", chatLoading && "animate-spin")} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {chatLoading && conversations.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-content-secondary dark:text-content-dark-secondary">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" /> Loading…
                    </div>
                  ) : filteredChats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
                      <div className="w-10 h-10 rounded-2xl bg-surface-tertiary dark:bg-surface-dark-tertiary flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-content-secondary opacity-50" />
                      </div>
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No conversations</p>
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
                            "w-full text-left px-3 py-3 border-b border-line dark:border-line-dark transition-colors border-l-2",
                            isActive
                              ? "bg-primary/5 dark:bg-primary-400/5 border-l-primary dark:border-l-primary-300"
                              : "hover:bg-surface-hover dark:hover:bg-surface-dark-hover border-l-transparent"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={displayName(conv.user)} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-content dark:text-content-dark truncate">{displayName(conv.user)}</p>
                                <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate">{conv.user.email}</p>
                              </div>
                            </div>
                            <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                          </div>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary line-clamp-2 ml-9">{lastMessage(conv)}</p>
                          <p className="text-[10px] text-content-tertiary dark:text-content-dark-secondary mt-1 ml-9">{formatRelativeTime(new Date(conv.updatedAt))}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Detail */}
              <div className={cn(
                "flex-1 flex flex-col overflow-hidden bg-surface dark:bg-surface-dark",
                showChatDetail ? "flex" : "hidden sm:flex"
              )}>
                {!activeConv ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 dark:bg-primary-400/10 flex items-center justify-center">
                      <MessageSquare className="h-8 w-8 text-primary dark:text-primary-300 opacity-60" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-content dark:text-content-dark">No conversation selected</p>
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-1 max-w-xs">
                        Choose a customer conversation from the list to review and respond.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => setActiveId(null)} className="sm:hidden p-1.5 rounded-lg text-content-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <Avatar name={displayName(activeConv.user)} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight truncate">{displayName(activeConv.user)}</p>
                          <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary truncate">{activeConv.user.email}</p>
                        </div>
                        {activeStatus && (
                          <Badge variant={STATUS_CFG[activeStatus].variant} size="sm" className="hidden sm:inline-flex">{STATUS_CFG[activeStatus].label}</Badge>
                        )}
                      </div>
                      <Button
                        variant={activeStatus === "resolved" ? "secondary" : "accent"}
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={handleMarkResolved}
                        disabled={activeStatus === "resolved"}
                      >
                        <span className="hidden sm:inline">{activeStatus === "resolved" ? "Resolved" : "Mark Resolved"}</span>
                      </Button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                      {activeConv.messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                          <MessageSquare className="h-8 w-8 text-content-tertiary opacity-30" />
                          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">No messages yet.</p>
                        </div>
                      ) : (
                        activeConv.messages.map((msg) => {
                          const isUser = msg.role === "user";
                          return (
                            <div key={msg.id} className={cn("flex gap-2.5", isUser ? "justify-start" : "justify-end")}>
                              {isUser && <Avatar name={displayName(activeConv.user)} size="sm" className="mt-0.5 shrink-0" />}
                              <div className={cn("max-w-[80%] sm:max-w-[70%] space-y-1", !isUser && "items-end flex flex-col")}>
                                <div className={cn(
                                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                                  isUser
                                    ? "bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark border border-line dark:border-line-dark rounded-tl-sm"
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

                    {/* Composer */}
                    <div className={cn(
                      "shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface-card dark:bg-surface-dark-card",
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
                          placeholder="Type a reply… (Ctrl+Enter to send)"
                          rows={2}
                          className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors disabled:opacity-50"
                        />
                        <Button variant="primary" size="md" loading={sending} disabled={!replyText.trim() || activeStatus === "resolved"} onClick={handleSendReply} icon={!sending ? <Send className="h-4 w-4" /> : undefined}>
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
          {/* KB ASSISTANT                                           */}
          {/* ══════════════════════════════════════════════════════ */}
          {tab === "assistant" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top bar */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30">
                    <Bot className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content dark:text-content-dark">KB Assistant</p>
                    <p className="text-[10px] text-content-secondary dark:text-content-dark-secondary">Answers from service documentation</p>
                  </div>
                </div>
                <button
                  onClick={() => { setKbMessages([]); setKbConvId(null); }}
                  disabled={kbMessages.length === 0 || kbStreaming}
                  className="flex items-center gap-1.5 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark transition-colors disabled:opacity-30 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> New chat
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-4 bg-surface dark:bg-surface-dark">
                {kbMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-5 text-center max-w-md mx-auto">
                    <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center">
                      <Bot className="h-9 w-9 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-content dark:text-content-dark">Service Knowledge Base</p>
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-1.5 leading-relaxed">
                        Ask anything about troubleshooting, maintenance, or technical procedures. Answers are based only on documents trained by your admin.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {["How to calibrate the machine?", "Error code E02", "Cleaning procedure", "Daily maintenance steps"].map((s) => (
                        <button
                          key={s}
                          onClick={() => setKbInput(s)}
                          className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors font-medium"
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
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        )}
                        <div className={cn("max-w-[85%] sm:max-w-[75%] space-y-1", isUser && "items-end flex flex-col")}>
                          <div className={cn(
                            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                            isUser
                              ? "bg-primary text-white rounded-tr-sm"
                              : "bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark border border-line dark:border-line-dark rounded-tl-sm"
                          )}>
                            {msg.content || (
                              <span className="flex items-center gap-2 text-content-secondary dark:text-content-dark-secondary">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" /> Thinking…
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
              <div className="shrink-0 border-t border-line dark:border-line-dark px-4 py-3 bg-surface-card dark:bg-surface-dark-card">
                <div className="flex items-end gap-2">
                  <textarea
                    value={kbInput}
                    onChange={(e) => setKbInput(e.target.value)}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleKbSend(); } }}
                    disabled={kbStreaming}
                    placeholder="Ask about troubleshooting, error codes, maintenance… (Ctrl+Enter to send)"
                    rows={2}
                    className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors disabled:opacity-50"
                  />
                  <Button variant="primary" size="md" loading={kbStreaming} disabled={!kbInput.trim()} onClick={handleKbSend} icon={!kbStreaming ? <Send className="h-4 w-4" /> : undefined}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ── Toasts ─────────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
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
