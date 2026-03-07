"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
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
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";

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

async function sendMessageToAI(conversationId: string, content: string): Promise<string> {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ conversationId, content }),
  });
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return data.assistantMessage.content;
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVED — mock AI responses were here
// ─────────────────────────────────────────────────────────────────────────────

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
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    try {
      const convId = conversationId ?? await createConversation();
      const answer = await sendMessageToAI(convId, text.trim());
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: answer },
      ]);
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
      createConversation().catch(console.error);
    }
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

        {/* Status pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">AI Online</span>
        </div>

        <div className="flex-1" />

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
              onClick={() => handleQuickReply(p.name)}
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
            disabled={!input.trim() || isTyping}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-center text-xs text-content-secondary dark:text-content-dark-secondary mt-2">
          Poornasree AI · v1.0 · For support call <span className="font-medium">1800-XXX-XXXX</span>
        </p>
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
}: {
  msg: ChatMessage;
  liked: boolean | null | undefined;
  onLike: (v: boolean) => void;
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

        {/* Feedback */}
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
        </div>
      </div>
    </div>
  );
}
