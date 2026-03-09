"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Mic,
  LogOut,
  Waves,
  Zap,
  Plug,
  Battery,
  CircuitBoard,
  Cpu,
  Wrench,
  Sparkles,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  User,
  Bot,
  Volume2,
  VolumeX,
  Globe,
  Youtube,
  Headphones,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getSocket, closeSocket } from "@/lib/socket-client";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Message = {
  role: "user" | "assistant";
  content: string;
};

interface ChatMessage extends Message {
  id: string;
}

interface SupportMessageItem {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName?: string; role: string };
}

interface SupportRequestState {
  id: string;
  status: "pending" | "active" | "resolved";
  problem: string;
  machineName?: string;
  engineer?: { id: string; firstName: string; lastName?: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CATALOGUE
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS = [
  {
    name: "VIBRO Stirrer",
    short: "VIBRO",
    keywords: ["vibro", "stirrer", "vibration", "stir"],
    icon: <Waves className="w-4 h-4" />,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
    complaints: ["Not working – LED off", "LED on but not vibrating", "Continuous/low vibration"],
  },
  {
    name: "Solar Charger Board",
    short: "Solar Charger",
    keywords: ["solar", "charger", "charging", "solar charger"],
    icon: <Zap className="w-4 h-4" />,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
    complaints: ["Battery not charging", "LED issues", "Voltage cutoff problems"],
  },
  {
    name: "Compact Adapter",
    short: "Adapter",
    keywords: ["compact adapter", "adapter", "lse", "eco v"],
    icon: <Plug className="w-4 h-4" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
    complaints: ["Zero output voltage", "Voltage fluctuation"],
  },
  {
    name: "ECOD-DPST Board",
    short: "ECOD-DPST",
    keywords: ["ecod", "dpst", "display", "keypad", "wifi", "gsm", "printer"],
    icon: <CircuitBoard className="w-4 h-4" />,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/30",
    complaints: ["Please wait loop", "Display not working", "Keypad fault", "WiFi/GSM issues"],
  },
  {
    name: "Pump",
    short: "Pump",
    keywords: ["pump", "motor"],
    icon: <Cpu className="w-4 h-4" />,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
    border: "border-cyan-200 dark:border-cyan-500/30",
    complaints: ["Pump not working", "Wrong direction", "Sensing errors"],
  },
  {
    name: "Analyzer Mainboard",
    short: "Mainboard",
    keywords: ["mainboard", "analyzer", "calibration", "sensor", "t2", "temperature", "lcd"],
    icon: <Wrench className="w-4 h-4" />,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/30",
    complaints: ["T2/Temperature errors", "Sensor issues", "Calibration failures", "LCD fault"],
  },
  {
    name: "Battery",
    short: "Battery",
    keywords: ["battery", "ecod battery", "ecosv", "lses"],
    icon: <Battery className="w-4 h-4" />,
    color: "text-lime-600 dark:text-lime-400",
    bg: "bg-lime-50 dark:bg-lime-500/10",
    border: "border-lime-200 dark:border-lime-500/30",
    complaints: ["Low battery error", "Battery not charging fully"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AI API
// ─────────────────────────────────────────────────────────────────────────────

async function sendMessageToAI(conversationId: string, content: string, language?: string, productContext?: string | null): Promise<string> {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ conversationId, content, language, ...(productContext ? { productContext } : {}) }),
  });
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return data.assistantMessage.content;
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVED — mock AI responses were here
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE OPTIONS
// ─────────────────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ml", label: "Malayalam", flag: "🇮🇳" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────────────────────────────────────────

function makeWelcome(name: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: `Hello ${name}! 👋 I'm **Poornasree AI**, your personal product assistant.\n\nI can provide step-by-step troubleshooting for all milk analyzer products. Select a product above or describe your issue — I'll guide you through it.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerChatPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean | null>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [youtubeResults, setYoutubeResults] = useState<Record<string, string>>({}); // msgId -> search query
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // selectedProduct tracks which product chip was last clicked; prepended to
  // the RAG search query to improve vector search recall.
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  // ── Support / Human escalation state ─────────────────────────────────────
  const [engineerOnline, setEngineerOnline] = useState(false);
  const [showSupportPanel, setShowSupportPanel] = useState(false);
  const [supportRequest, setSupportRequest] = useState<SupportRequestState | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessageItem[]>([]);
  const [supportInput, setSupportInput] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportFormProblem, setSupportFormProblem] = useState("");
  const [supportFormMachine, setSupportFormMachine] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  const endRef     = useRef<HTMLDivElement>(null);
  const supportEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  const createConversation = async () => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: "Customer Chat" }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const data = await res.json();
    setConversationId(data.conversation.id);
    return data.conversation.id as string;
  };

  // Redirect if not authenticated or not customer
  useEffect(() => {
    if (!isLoading) {
      if (!user) { router.replace("/customer-login"); return; }
      if (user.role !== "customer") { router.replace("/"); return; }
      setMessages([makeWelcome(user.firstName)]);
      createConversation().catch(console.error);
    }
  }, [user, isLoading, router]);

  // ── Socket.IO: engineer presence + support events ────────────────────────
  useEffect(() => {
    if (!user || user.role !== "customer") return;

    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });

    sock.on("engineer:status", ({ isOnline }: { isOnline: boolean }) => {
      setEngineerOnline(isOnline);
    });

    sock.on("request:accepted", ({ requestId, engineer }: { requestId: string; engineer: SupportRequestState["engineer"] }) => {
      setSupportRequest((prev) =>
        prev?.id === requestId ? { ...prev, status: "active", engineer } : prev
      );
      if (supportRequest?.id === requestId) {
        sock.emit("support:join", requestId);
        loadSupportMessages(requestId);
      }
    });

    sock.on("chat:message", ({ requestId, message }: { requestId: string; message: SupportMessageItem }) => {
      if (supportRequest?.id === requestId) {
        setSupportMessages((prev) => [...prev, message]);
      }
    });

    sock.on("request:resolved", ({ requestId }: { requestId: string }) => {
      if (supportRequest?.id === requestId) {
        setSupportRequest((prev) => prev ? { ...prev, status: "resolved" } : prev);
      }
    });

    return () => {
      sock.off("engineer:status");
      sock.off("request:accepted");
      sock.off("chat:message");
      sock.off("request:resolved");
      closeSocket();
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // When support request becomes active, join its socket room
  useEffect(() => {
    if (supportRequest?.status === "active" && user) {
      const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });
      sock.emit("support:join", supportRequest.id);
      loadSupportMessages(supportRequest.id);
    }
  }, [supportRequest?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSupportMessages = useCallback(async (requestId: string) => {
    try {
      const res = await fetch(`/api/support/requests/${requestId}/messages`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSupportMessages(data.messages);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    supportEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [supportMessages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    try {
      const convId = conversationId ?? await createConversation();
      const answer = await sendMessageToAI(convId, text.trim(), language, selectedProduct);
      const botId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: botId, role: "assistant", content: answer },
      ]);
      // Store YouTube search query for this response
      setYoutubeResults((prev) => ({ ...prev, [botId]: text.trim() }));
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, I couldn't process your request. Please try again.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleQuickReply = (text: string) => sendMessage(text);
  const handleReset = () => {
    if (user) {
      setMessages([makeWelcome(user.firstName)]);
      setConversationId(null);
      setYoutubeResults({});
      setSpeakingId(null);
      setSelectedProduct(null);
      setSupportRequest(null);
      setSupportMessages([]);
      setShowSupportPanel(false);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      createConversation().catch(console.error);
    }
  };

  // ── Support request creation ──────────────────────────────────────────────
  const handleCreateSupportRequest = async () => {
    if (!conversationId || !supportFormProblem.trim()) return;
    setSupportSubmitting(true);
    try {
      const res = await fetch("/api/support/requests", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conversationId,
          problem:     supportFormProblem.trim(),
          machineName: supportFormMachine.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSupportRequest({
          id:          data.request.id,
          status:      "pending",
          problem:     data.request.problem,
          machineName: data.request.machineName,
          engineer:    null,
        });
        setSupportFormProblem("");
        setSupportFormMachine("");
      }
    } finally {
      setSupportSubmitting(false);
    }
  };

  // ── Send message to engineer ──────────────────────────────────────────────
  const handleSendSupportMessage = async () => {
    if (!supportInput.trim() || !supportRequest || supportSending) return;
    const text = supportInput.trim();
    setSupportInput("");
    setSupportSending(true);
    try {
      await fetch(`/api/support/requests/${supportRequest.id}/messages`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });
    } finally {
      setSupportSending(false);
    }
  };

  const handleSpeak = (msgId: string, text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\*\*(.*?)\*\*/g, "$1"));
    const langMap: Record<string, string> = { en: "en-US", ml: "ml-IN", hi: "hi-IN" };
    utterance.lang = langMap[language] || "en-US";
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };
  if (isLoading) return <LoadingScreen message="Loading your portal…" />;
  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Logo variant="full" size="sm" className="hidden sm:flex" />
        <Logo variant="icon" size="sm" className="flex sm:hidden" />

        {/* Product title */}
        <div className="hidden md:flex flex-col -ml-1">
          <span className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
            AI Support Assistant
          </span>
          <span className="text-[10px] text-content-secondary dark:text-content-dark-secondary leading-none">
            Powered by Poornasree AI
          </span>
        </div>

        {/* Status pill — AI online */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">AI Online</span>
        </div>

        {/* Engineer online status (Feature 4) */}
        <div className={cn(
          "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium",
          engineerOnline
            ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400"
            : "bg-surface-tertiary dark:bg-surface-dark-tertiary border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", engineerOnline ? "bg-blue-500 animate-pulse" : "bg-gray-400")} />
          {engineerOnline ? "Support Online" : "Support Offline"}
        </div>

        <div className="flex-1" />

        {/* Language selector */}
        <div className="relative">
          <button
            onClick={() => setLangMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {LANGUAGES.find((l) => l.code === language)?.flag}{" "}
            {LANGUAGES.find((l) => l.code === language)?.label}
          </button>
          {langMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setLangMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card shadow-lg overflow-hidden">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLanguage(l.code); setLangMenuOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2",
                      language === l.code
                        ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                        : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                    )}
                  >
                    <span>{l.flag}</span> {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <ThemeToggle />

        <div className="flex items-center gap-2">
          <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
          <span className="text-sm font-medium text-content dark:text-content-dark hidden sm:block">
            {user.firstName}
          </span>
        </div>

        <button
          onClick={() => { logout(); router.replace("/customer-login"); }}
          className="p-2 rounded-xl text-content-secondary dark:text-content-dark-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 scrollbar-thin">

        {/* Product chips (always visible above messages) */}
        <div className="flex flex-wrap gap-2 pb-2 border-b border-line dark:border-line-dark">
          {PRODUCTS.map((p) => (
            <button
              key={p.name}
              onClick={() => { setSelectedProduct(p.name); handleQuickReply(p.name); }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:scale-105 active:scale-100",
                p.bg, p.border, p.color
              )}
            >
              {p.icon} {p.short}
            </button>
          ))}
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        <div className="max-w-2xl mx-auto w-full space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              liked={liked[msg.id]}
              onLike={(v) => setLiked((prev) => ({ ...prev, [msg.id]: v }))}
              youtubeQuery={youtubeResults[msg.id]}
              speakingId={speakingId}
              onSpeak={handleSpeak}
            />
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block w-2 h-2 rounded-full bg-primary/60 dark:bg-primary-400/60 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card px-3 sm:px-6 py-3">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark focus-within:border-primary dark:focus-within:border-primary-400 transition-colors">
            <Sparkles className="w-4 h-4 text-primary dark:text-primary-300 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a product or describe your issue…"
              className="flex-1 bg-transparent text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary outline-none"
            />
          </div>
          <button
            type="button"
            className="p-2.5 rounded-xl border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            title="Voice input (coming soon)"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={isTyping || input.trim() === ""}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Contact Service Engineer button (Feature 1) */}
        <div className="max-w-2xl mx-auto mt-2 flex items-center justify-between">
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
            Poornasree AI · v1.0
          </p>
          {!supportRequest && (
            <button
              onClick={() => setShowSupportPanel((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors",
                showSupportPanel
                  ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400"
                  : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
            >
              <Headphones className="w-3.5 h-3.5" />
              Contact Service Engineer
              <ChevronDown className={cn("w-3 h-3 transition-transform", showSupportPanel && "-rotate-180")} />
            </button>
          )}
          {supportRequest && (
            <button
              onClick={() => setShowSupportPanel((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400"
            >
              <Headphones className="w-3.5 h-3.5" />
              Support Chat
              {supportRequest.status === "pending" && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-1" />}
              {supportRequest.status === "active" && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-1" />}
              <ChevronDown className={cn("w-3 h-3 transition-transform", showSupportPanel && "-rotate-180")} />
            </button>
          )}
        </div>

        {/* ── Support Panel ───────────────────────────────────────────────── */}
        {showSupportPanel && (
          <div className="max-w-2xl mx-auto mt-3 rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 overflow-hidden">

            {/* No request yet — form */}
            {!supportRequest && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-content dark:text-content-dark">Contact Service Engineer</span>
                  </div>
                  {!engineerOnline && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                      Engineers offline — will be queued
                    </span>
                  )}
                  {engineerOnline && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                      Engineer Online
                    </span>
                  )}
                </div>
                <textarea
                  value={supportFormProblem}
                  onChange={(e) => setSupportFormProblem(e.target.value)}
                  placeholder="Describe your issue…"
                  rows={2}
                  className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <input
                  value={supportFormMachine}
                  onChange={(e) => setSupportFormMachine(e.target.value)}
                  placeholder="Machine / product name (optional)"
                  className="w-full text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
                  onClick={handleCreateSupportRequest}
                  disabled={!supportFormProblem.trim() || supportSubmitting || !conversationId}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {supportSubmitting ? "Submitting…" : "Submit Support Request"}
                </button>
              </div>
            )}

            {/* Pending — waiting for engineer */}
            {supportRequest?.status === "pending" && (
              <div className="p-4 flex flex-col items-center gap-3 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-content dark:text-content-dark">Waiting for a service engineer…</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                    Your request has been added to the queue.
                    {!engineerOnline && " Engineers will respond when they come online."}
                  </p>
                </div>
                <div className="rounded-xl border border-line dark:border-line-dark p-3 text-left w-full bg-surface dark:bg-surface-dark">
                  <p className="text-xs font-medium text-content dark:text-content-dark mb-0.5">Your issue:</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{supportRequest.problem}</p>
                  {supportRequest.machineName && (
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">Machine: {supportRequest.machineName}</p>
                  )}
                </div>
              </div>
            )}

            {/* Active — real-time chat */}
            {supportRequest?.status === "active" && (
              <div className="flex flex-col" style={{ maxHeight: 280 }}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-200 dark:border-blue-500/30 bg-blue-100/50 dark:bg-blue-500/10">
                  <Avatar name={`${supportRequest.engineer?.firstName ?? "E"} ${supportRequest.engineer?.lastName ?? ""}`} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-content dark:text-content-dark truncate">
                      {supportRequest.engineer?.firstName} {supportRequest.engineer?.lastName ?? ""} — Service Engineer
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Connected</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ minHeight: 120, maxHeight: 160 }}>
                  {supportMessages.length === 0 && (
                    <p className="text-xs text-center text-content-secondary dark:text-content-dark-secondary py-4">
                      Engineer connected. Start your conversation.
                    </p>
                  )}
                  {supportMessages.map((m) => {
                    const isMe = m.senderId === user?.id;
                    return (
                      <div key={m.id} className={cn("flex gap-2", isMe && "justify-end")}>
                        {!isMe && <Avatar name={m.sender.firstName} size="sm" className="mt-0.5" />}
                        <div className={cn(
                          "max-w-[75%] px-3 py-1.5 rounded-xl text-xs leading-relaxed",
                          isMe
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-surface dark:bg-surface-dark text-content dark:text-content-dark border border-line dark:border-line-dark rounded-bl-sm"
                        )}>
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={supportEndRef} />
                </div>
                <div className="flex gap-2 px-3 py-2 border-t border-blue-200 dark:border-blue-500/30">
                  <input
                    value={supportInput}
                    onChange={(e) => setSupportInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendSupportMessage()}
                    placeholder="Message engineer…"
                    className="flex-1 text-xs rounded-xl px-3 py-1.5 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none"
                  />
                  <button
                    onClick={handleSendSupportMessage}
                    disabled={!supportInput.trim() || supportSending}
                    className="p-1.5 rounded-xl bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Resolved */}
            {supportRequest?.status === "resolved" && (
              <div className="p-4 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <p className="text-sm font-semibold text-content dark:text-content-dark">Issue Resolved</p>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                  Your support request has been marked as resolved by the engineer.
                </p>
                <button
                  onClick={() => { setSupportRequest(null); setShowSupportPanel(false); setSupportMessages([]); }}
                  className="text-xs px-3 py-1.5 rounded-xl border border-line dark:border-line-dark text-content-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE BUBBLE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  liked,
  onLike,
  youtubeQuery,
  speakingId,
  onSpeak,
}: {
  msg: ChatMessage;
  liked: boolean | null | undefined;
  onLike: (v: boolean) => void;
  youtubeQuery?: string;
  speakingId: string | null;
  onSpeak: (msgId: string, text: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2 items-end">
        <div className="max-w-[80%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-white text-sm font-medium shadow-sm">
          {msg.content}
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
        </div>
      </div>
    );
  }

  const isSpeaking = speakingId === msg.id;
  const ytSearchUrl = youtubeQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery + " troubleshooting repair")}`
    : null;

  // Assistant message
  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
      </div>
      <div className="flex-1 space-y-2.5 max-w-[90%] sm:max-w-[80%]">

        {/* Main text bubble */}
        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm">
          <p className="text-sm text-content dark:text-content-dark whitespace-pre-line leading-relaxed">
            {msg.content.replace(/\*\*(.*?)\*\*/g, "$1")}
          </p>
        </div>

        {/* YouTube suggestion */}
        {ytSearchUrl && msg.id !== "welcome" && (
          <a
            href={ytSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors group"
          >
            <div className="shrink-0 p-1.5 rounded-lg bg-red-100 dark:bg-red-500/20">
              <Youtube className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                Watch related videos on YouTube
              </p>
              <p className="text-[10px] text-red-500 dark:text-red-400 truncate">
                Search: {youtubeQuery}
              </p>
            </div>
            <span className="text-xs text-red-400 group-hover:text-red-500 dark:group-hover:text-red-300">→</span>
          </a>
        )}

        {/* Feedback + Audio */}
        <div className="flex items-center gap-2 pl-1">
          <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Was this helpful?</span>
          <button
            onClick={() => onLike(true)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              liked === true
                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
            )}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onLike(false)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              liked === false
                ? "bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400"
                : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
            )}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>

          {/* Audio TTS button */}
          {msg.id !== "welcome" && (
            <button
              onClick={() => onSpeak(msg.id, msg.content)}
              className={cn(
                "p-1.5 rounded-lg transition-colors ml-1",
                isSpeaking
                  ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                  : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
              title={isSpeaking ? "Stop speaking" : "Listen to response"}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
