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
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LogOut,
  RefreshCw,
  Send,
  Loader2,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Plus,
  MessageSquare,
  Trash2,
  History,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
interface KbMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ═══════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // ── KB Assistant state ─────────────────────────────────────────────
  const [kbMessages, setKbMessages] = useState<KbMessage[]>([]);
  const [kbConvId, setKbConvId] = useState<string | null>(null);
  const [kbInput, setKbInput] = useState("");
  const [kbStreaming, setKbStreaming] = useState(false);
  const kbEndRef = useRef<HTMLDivElement>(null);

  // ── Conversation history ──────────────────────────────────────────
  interface ConvHistoryItem { id: string; title: string | null; createdAt: string; updatedAt: string }
  const [convHistory, setConvHistory] = useState<ConvHistoryItem[]>([]);

  const loadConvHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConvHistory(data.conversations || []);
      }
    } catch { /* non-fatal */ }
  }, []);

  const selectConv = useCallback(async (conv: ConvHistoryItem) => {
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(conv.id)}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const msgs: KbMessage[] = (data.conversation?.messages || []).map((m: { id: string; role: string; content: string; createdAt: string }) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setKbConvId(conv.id);
      setKbMessages(msgs);
    } catch { /* non-fatal */ }
  }, []);

  const deleteConv = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setConvHistory((prev) => prev.filter((c) => c.id !== id));
        if (kbConvId === id) { setKbMessages([]); setKbConvId(null); }
      }
    } catch { /* non-fatal */ }
  }, [kbConvId]);

  const handleNewChat = useCallback(() => {
    setKbMessages([]);
    setKbConvId(null);
  }, []);

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
    else if (!authLoading && user) loadConvHistory();
  }, [user, authLoading, router, loadConvHistory]);

  useEffect(() => { kbEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [kbMessages]);

  // ── KB Send ────────────────────────────────────────────────────────
  const handleKbSend = useCallback(async () => {
    if (!kbInput.trim() || kbStreaming) return;
    setKbStreaming(true);
    const text = kbInput.trim();
    setKbInput("");
    const userMsgId = `kb-user-${Date.now()}`;
    setKbMessages((p) => [...p, { id: userMsgId, role: "user", content: text, timestamp: new Date() }]);
    const botMsgId = `kb-bot-${Date.now()}`;
    setKbMessages((p) => [...p, { id: botMsgId, role: "assistant", content: "", timestamp: new Date() }]);
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
        loadConvHistory();
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
    } finally { setKbStreaming(false); }
  }, [kbInput, kbStreaming, kbConvId, loadConvHistory]);

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

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

        {/* KB Assistant label */}
        <div className="px-3 py-4 border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30">
              <Bot className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-content dark:text-content-dark">KB Assistant</p>
              <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary">Service documentation</p>
            </div>
          </div>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 border-b border-line dark:border-line-dark">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content dark:text-content-dark text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {convHistory.length === 0 ? (
            <div className="flex flex-col items-center py-8 px-3 text-center gap-2">
              <History className="w-6 h-6 text-content-secondary/30 dark:text-content-dark-secondary/30" />
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No previous chats</p>
            </div>
          ) : (
            convHistory.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors mb-0.5 flex items-center gap-2 group",
                  kbConvId === conv.id
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <button onClick={() => selectConv(conv)} className="flex items-center gap-2 flex-1 min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-40" />
                  <span className="truncate flex-1">{conv.title || "Untitled"}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConv(conv.id); }}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))
          )}
        </div>

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
              KB Assistant
            </h1>
            <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary">
              {getGreeting()}, {user.firstName}
            </p>
          </div>
          <Badge variant="info" dot>
            {user.role === "admin" ? "Admin" : "Service Engineer"}
          </Badge>
        </header>

        {/* ── KB Chat ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30">
                <Bot className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-content dark:text-content-dark">Knowledge Base</p>
                <p className="text-[11px] sm:text-[10px] text-content-secondary dark:text-content-dark-secondary">Answers from service documentation</p>
              </div>
            </div>
            <button
              onClick={handleNewChat}
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
                      <p className="text-[11px] sm:text-[10px] text-content-tertiary dark:text-content-dark-secondary px-1">
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
                className="flex-1 resize-none rounded-xl px-3 py-2 text-base sm:text-sm bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary border border-line dark:border-line-dark focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors disabled:opacity-50"
              />
              <Button variant="primary" size="md" loading={kbStreaming} disabled={!kbInput.trim()} onClick={handleKbSend} icon={!kbStreaming ? <Send className="h-4 w-4" /> : undefined}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
