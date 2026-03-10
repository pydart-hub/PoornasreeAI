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
  CheckCircle2,
  X,
  History,
  Plus,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Logo, Avatar, ThemeToggle, LoadingScreen } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getSocket, closeSocket } from "@/lib/socket-client";
import { LANGUAGES, LANG_BCP47 } from "@/lib/languages";

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

interface ConversationHistoryItem {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
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
  const [unreadSupport, setUnreadSupport] = useState(0);

  // ── Voice input state ─────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── Translation state ──────────────────────────────────────────────────────
  const [translatedContent, setTranslatedContent] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const translationCacheRef = useRef<Record<string, Record<string, string>>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const prevLangRef = useRef<string>('en');

  // ── History sidebar ────────────────────────────────────────────────────────
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistoryItem[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // ── Draggable support widget ───────────────────────────────────────────────
  const [supportPos, setSupportPos] = useState({ x: 0, y: 0 });
  const supportDragData = useRef<{ origX: number; origY: number; mouseX: number; mouseY: number } | null>(null);
  const isDraggingWidget = useRef(false);

  const showSupportPanelRef = useRef(false);

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

  const loadConversationHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConversationHistory(data.conversations || []);
      }
    } catch { /* non-fatal */ }
  }, []); // eslint-disable-line

  // Redirect if not authenticated or not customer
  useEffect(() => {
    if (!isLoading) {
      if (!user) { router.replace("/customer-login"); return; }
      if (user.role !== "customer") { router.replace("/"); return; }
      setMessages([makeWelcome(user.firstName)]);
      createConversation().catch(console.error);
      loadConversationHistory().catch(console.error);
    }
  }, [user, isLoading, router, loadConversationHistory]); // eslint-disable-line

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
      // Auto-open the chat panel so the customer knows they've been connected
      setShowSupportPanel(true);
    });

    sock.on("chat:message", ({ message }: { requestId: string; message: SupportMessageItem }) => {
      // Server delivers only to this client's room — no requestId guard needed
      setSupportMessages((prev) => [...prev, message]);
      if (!showSupportPanelRef.current) setUnreadSupport((c) => c + 1);
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

  // ── Translation function ──────────────────────────────────────────────────────
  const translateText = useCallback(async (text: string, targetLang: string): Promise<string> => {
    if (targetLang === 'en' || !text.trim()) return text;
    if (translationCacheRef.current[targetLang]?.[text]) return translationCacheRef.current[targetLang][text];
    try {
      const chunks: string[] = [];
      let rem = text;
      while (rem.length > 0) { chunks.push(rem.slice(0, 490)); rem = rem.slice(490); }
      const parts = await Promise.all(chunks.map(async (ch) => {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(ch)}&langpair=en|${targetLang}`);
        const d = await res.json();
        return (d.responseData?.translatedText as string) || ch;
      }));
      const result = parts.join('');
      if (!translationCacheRef.current[targetLang]) translationCacheRef.current[targetLang] = {};
      translationCacheRef.current[targetLang][text] = result;
      return result;
    } catch { return text; }
  }, []); // eslint-disable-line

  // ── Select conversation from history ───────────────────────────────────────────────
  const selectConversation = useCallback((conv: ConversationHistoryItem) => {
    const msgs: ChatMessage[] = conv.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    setMessages(msgs.length > 0 ? msgs : [makeWelcome(user?.firstName ?? 'there')]);
    setConversationId(conv.id);
    setTranslatedContent({});
    setHistorySidebarOpen(false);
  }, []); // eslint-disable-line

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    supportEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [supportMessages]);

  // Keep ref in sync with state so socket handlers can read it without stale closure
  useEffect(() => {
    showSupportPanelRef.current = showSupportPanel;
    if (showSupportPanel) setUnreadSupport(0);
  }, [showSupportPanel]);

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
      setTranslatedContent({});
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      createConversation().catch(console.error);
      loadConversationHistory().catch(console.error);
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

  // Preload voices on mount so they're ready before the user clicks speak
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
    const onReady = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", onReady);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onReady);
      window.speechSynthesis.cancel();
    };
  }, []);

  // speak() MUST be called synchronously inside the click handler (iOS Safari requirement)
  const handleSpeak = (msgId: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;

    if (speakingId === msgId) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }

    synth.cancel();

    const langMap = LANG_BCP47;
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\n+/g, ". ")
      .trim();
    if (!cleanText) return;

    const utt = new SpeechSynthesisUtterance(cleanText);
    utt.lang = langMap[language] || "en-US";
    utt.rate = 0.9;
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);

    setSpeakingId(msgId);
    synth.speak(utt);
  };

  // Keep messages ref current for language translation effect
  messagesRef.current = messages;

  // ── Mobile detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Language change → translate all existing assistant messages ─────────────────
  useEffect(() => {
    if (prevLangRef.current === language) return;
    prevLangRef.current = language;
    if (language === 'en') { setTranslatedContent({}); return; }
    const toTranslate = messagesRef.current.filter((m) => m.role === 'assistant' && m.content);
    if (!toTranslate.length) return;
    setTranslating(true);
    Promise.all(toTranslate.map(async (m) => {
      const t = await translateText(m.content, language);
      return [m.id, t] as [string, string];
    })).then((pairs) => {
      setTranslatedContent(Object.fromEntries(pairs));
      setTranslating(false);
    }).catch(() => setTranslating(false));
  }, [language, translateText]); // eslint-disable-line

  // ── Drag: attach global mouse/touch move listeners ────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!supportDragData.current) return;
      const pt = 'touches' in e ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      const dx = pt.clientX - supportDragData.current.mouseX;
      const dy = pt.clientY - supportDragData.current.mouseY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDraggingWidget.current = true;
      setSupportPos({ x: supportDragData.current.origX + dx, y: supportDragData.current.origY + dy });
    };
    const onUp = () => { supportDragData.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []); // eslint-disable-line

  if (isLoading) return <LoadingScreen message="Loading your portal…" />;
  if (!user) return null;

  return (
    <div className="h-screen flex bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ── History Sidebar overlay (mobile) ── */}
      {historySidebarOpen && isMobile && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setHistorySidebarOpen(false)} />
      )}

      {/* ── History Sidebar ── */}
      <aside className={cn(
        "flex flex-col bg-surface-sidebar dark:bg-surface-dark-sidebar border-r border-line dark:border-line-dark transition-all duration-300 z-40 overflow-hidden",
        isMobile
          ? cn("fixed inset-y-0 left-0 w-72 shadow-2xl", historySidebarOpen ? "translate-x-0" : "-translate-x-full")
          : cn("relative shrink-0", historySidebarOpen ? "w-64" : "w-0")
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark shrink-0" style={{ minWidth: "16rem" }}>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
            <span className="text-sm font-semibold text-content dark:text-content-dark">Chat History</span>
          </div>
          <button onClick={() => setHistorySidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
            <X className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
          </button>
        </div>
        <div className="p-3 shrink-0" style={{ minWidth: "16rem" }}>
          <button
            onClick={() => { handleReset(); setHistorySidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content dark:text-content-dark text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin" style={{ minWidth: "16rem" }}>
          {conversationHistory.length === 0 ? (
            <div className="flex flex-col items-center py-12 px-4 text-center gap-3">
              <MessageSquare className="w-8 h-8 text-content-secondary/30 dark:text-content-dark-secondary/30" />
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary">No previous chats yet</p>
            </div>
          ) : (
            conversationHistory.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors mb-0.5 flex items-center gap-2",
                  conversationId === conv.id
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                    : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-40" />
                <span className="truncate flex-1">{conv.title || "Untitled Chat"}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1.5 sm:gap-3 sticky top-0 z-20">
        <button
          onClick={() => setHistorySidebarOpen((v) => !v)}
          className="p-1.5 sm:p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
          title="Chat History"
        >
          <History className="w-5 h-5" />
        </button>
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
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">AI Online</span>
        </div>

        {/* Engineer online status */}
        <div className={cn(
          "hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium",
          engineerOnline
            ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400"
            : "bg-surface-tertiary dark:bg-surface-dark-tertiary border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", engineerOnline ? "bg-blue-500 animate-pulse" : "bg-gray-400")} />
          {engineerOnline ? "Support Online" : "Support Offline"}
        </div>

        <div className="flex-1" />

        {/* Language selector */}
        <div className="relative shrink-0">
          <button
            onClick={() => setLangMenuOpen((v) => !v)}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border border-line dark:border-line-dark text-xs font-medium text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {LANGUAGES.find((l) => l.code === language)?.flag}{" "}
            <span className="hidden sm:inline">{translating ? <span className="animate-pulse">…</span> : LANGUAGES.find((l) => l.code === language)?.label}</span>
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

        <div className="hidden sm:block"><ThemeToggle /></div>

        <div className="hidden sm:flex items-center gap-2">
          <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
          <span className="text-sm font-medium text-content dark:text-content-dark hidden md:block">
            {user.firstName}
          </span>
        </div>

        <button
          onClick={() => { logout(); router.replace("/customer-login"); }}
          className="p-1.5 sm:p-2 rounded-xl text-content-secondary dark:text-content-dark-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
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
              translatedContent={translatedContent[msg.id]}
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
            onClick={() => {
              const SpeechRecognitionAPI = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
                || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
              if (!SpeechRecognitionAPI) { alert("Speech recognition is not supported in this browser."); return; }
              if (isRecording && recognitionRef.current) {
                recognitionRef.current.stop();
                setIsRecording(false);
                return;
              }
              const recog = new SpeechRecognitionAPI();
              recog.lang = LANG_BCP47[language] || "en-US";
              recog.interimResults = false;
              recog.maxAlternatives = 1;
              recog.onresult = (e) => {
                const transcript = e.results[0]?.[0]?.transcript ?? "";
                if (transcript) setInput((prev) => (prev ? prev + " " : "") + transcript);
              };
              recog.onerror = () => setIsRecording(false);
              recog.onend = () => setIsRecording(false);
              recognitionRef.current = recog;
              recog.start();
              setIsRecording(true);
            }}
            className={cn(
              "p-2.5 rounded-xl border transition-colors",
              isRecording
                ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-500 animate-pulse"
                : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
            )}
            title={isRecording ? "Stop recording" : "Voice input"}
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

        <div className="max-w-2xl mx-auto mt-2">
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
            Poornasree AI · v1.0
          </p>
        </div>
      </footer>
      </div>{/* end main content */}

      {/* ── Floating Support Widget ─────────────────────────────────────────
          Fixed bottom-right — standard live-chat widget pattern.
          Launcher button always visible; panel opens above it.              */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 touch-none select-none"
        style={{ transform: `translate(${supportPos.x}px, ${supportPos.y}px)` }}
      >

        {/* ── Panel ────────────────────────────────────────────────────────── */}
        {showSupportPanel && (
          <div className="w-80 sm:w-96 rounded-2xl shadow-2xl border border-blue-200 dark:border-blue-500/30 overflow-hidden bg-surface-card dark:bg-surface-dark-card flex flex-col" style={{ maxHeight: 520 }}>

            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-700 to-blue-500">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Headphones className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">
                  {supportRequest?.status === "active" && supportRequest.engineer
                    ? `${supportRequest.engineer.firstName}${supportRequest.engineer.lastName ? " " + supportRequest.engineer.lastName : ""}`
                    : "Service Support"}
                </p>
                <p className="text-[11px] text-blue-100 leading-tight mt-0.5">
                  {supportRequest?.status === "active"
                    ? "Connected · Service Engineer"
                    : supportRequest?.status === "pending"
                    ? "Waiting for an engineer…"
                    : engineerOnline
                    ? "Engineers available now"
                    : "Leave a message — we'll respond"}
                </p>
              </div>
              <button
                onClick={() => setShowSupportPanel(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

              {/* No request — submission form */}
              {!supportRequest && (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                    Describe your issue and a service engineer will assist you.
                  </p>
                  <textarea
                    value={supportFormProblem}
                    onChange={(e) => setSupportFormProblem(e.target.value)}
                    placeholder="Describe your issue…"
                    rows={3}
                    className="w-full text-sm rounded-xl px-3 py-2.5 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <input
                    value={supportFormMachine}
                    onChange={(e) => setSupportFormMachine(e.target.value)}
                    placeholder="Machine / product name (optional)"
                    className="w-full text-sm rounded-xl px-3 py-2.5 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button
                    onClick={handleCreateSupportRequest}
                    disabled={!supportFormProblem.trim() || supportSubmitting || !conversationId}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {supportSubmitting ? "Submitting…" : "Start Support Chat"}
                  </button>
                </div>
              )}

              {/* Pending — waiting for engineer */}
              {supportRequest?.status === "pending" && (
                <div className="p-6 flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                      <Headphones className="w-8 h-8 text-amber-500" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 border-2 border-surface-card dark:border-surface-dark-card animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content dark:text-content-dark">
                      Connecting you to an engineer…
                    </p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                      {engineerOnline
                        ? "An engineer will accept your request shortly."
                        : "Engineers are currently offline — your request has been queued."}
                    </p>
                  </div>
                  <div className="w-full rounded-xl border border-line dark:border-line-dark p-3 text-left bg-surface dark:bg-surface-dark space-y-1">
                    <p className="text-[11px] font-semibold text-content dark:text-content-dark">Your request:</p>
                    <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary leading-relaxed">
                      {supportRequest.problem}
                    </p>
                    {supportRequest.machineName && (
                      <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary">
                        Machine: <span className="font-medium">{supportRequest.machineName}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Active — real-time chat messages */}
              {supportRequest?.status === "active" && (
                <div className="px-3 py-3 space-y-2.5 overflow-y-auto" style={{ maxHeight: 320 }}>
                  {supportMessages.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                      <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                        Engineer connected. Start your conversation.
                      </p>
                    </div>
                  ) : (
                    supportMessages.map((m) => {
                      const isMe = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={cn("flex gap-2", isMe && "justify-end")}>
                          {!isMe && (
                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                {m.sender.firstName[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed",
                            isMe
                              ? "bg-blue-600 text-white rounded-br-sm"
                              : "bg-surface dark:bg-surface-dark text-content dark:text-content-dark border border-line dark:border-line-dark rounded-bl-sm"
                          )}>
                            {m.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={supportEndRef} />
                </div>
              )}

              {/* Resolved */}
              {supportRequest?.status === "resolved" && (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content dark:text-content-dark">Issue Resolved!</p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-1">
                      Your support session has ended.
                    </p>
                  </div>
                  <button
                    onClick={() => { setSupportRequest(null); setShowSupportPanel(false); setSupportMessages([]); }}
                    className="text-xs px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Chat input — only when active */}
            {supportRequest?.status === "active" && (
              <div className="flex gap-2 px-3 py-3 border-t border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                <input
                  value={supportInput}
                  onChange={(e) => setSupportInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendSupportMessage()}
                  placeholder="Message engineer…"
                  className="flex-1 text-sm rounded-xl px-3 py-2 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  onClick={handleSendSupportMessage}
                  disabled={!supportInput.trim() || supportSending}
                  className="p-2.5 rounded-xl bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Launcher button ───────────────────────────────────────────────── */}
        <button
          onClick={() => { if (!isDraggingWidget.current) setShowSupportPanel((v) => !v); }}
          onMouseDown={(e) => {
            isDraggingWidget.current = false;
            supportDragData.current = { origX: supportPos.x, origY: supportPos.y, mouseX: e.clientX, mouseY: e.clientY };
          }}
          onTouchStart={(e) => {
            isDraggingWidget.current = false;
            supportDragData.current = { origX: supportPos.x, origY: supportPos.y, mouseX: e.touches[0].clientX, mouseY: e.touches[0].clientY };
          }}
          className={cn(
            "relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors duration-200 cursor-grab active:cursor-grabbing",
            showSupportPanel ? "bg-blue-700" : "bg-blue-600 hover:bg-blue-700"
          )}
          title="Drag to move · Click to open support"
        >
          <Headphones className="w-6 h-6 text-white" />

          {/* Status dot */}
          <span className={cn(
            "absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white",
            supportRequest?.status === "active"
              ? "bg-emerald-400 animate-pulse"
              : supportRequest?.status === "pending"
              ? "bg-amber-400 animate-pulse"
              : engineerOnline
              ? "bg-emerald-400"
              : "bg-gray-400"
          )} />

          {/* Unread badge */}
          {unreadSupport > 0 && !showSupportPanel && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
              {unreadSupport > 9 ? "9+" : unreadSupport}
            </span>
          )}
        </button>
      </div>
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
  translatedContent,
}: {
  msg: ChatMessage;
  liked: boolean | null | undefined;
  onLike: (v: boolean) => void;
  youtubeQuery?: string;
  speakingId: string | null;
  onSpeak: (msgId: string, text: string) => void;
  translatedContent?: string;
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
            {(translatedContent || msg.content).replace(/\*\*(.*?)\*\*/g, "$1")}
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
              onClick={() => onSpeak(msg.id, translatedContent || msg.content)}
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
