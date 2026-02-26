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
  PlayCircle,
  ExternalLink,
  ChevronRight,
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

interface VideoCard {
  title: string;
  duration: string;
  views: string;
  url: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  steps?: string[];
  video?: VideoCard;
  quickReplies?: string[];
  isWelcome?: boolean;
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
// MOCK AI RESPONSE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSES: Record<string, { intro: string; steps: string[]; video: VideoCard; followUp: string[] }> = {
  "VIBRO Stirrer": {
    intro: "Here's how to diagnose and fix your **VIBRO Stirrer** issue step by step:",
    steps: [
      "Check the power supply — ensure the adapter is firmly connected and the correct voltage (12V) is supplied.",
      "Check the LED indicator: if LED is off, the PCB or fuse may be faulty. Try replacing the 1A fuse first.",
      "If LED is on but not vibrating, check the motor terminals for loose connections or corrosion.",
      "Test the motor coil resistance with a multimeter — should read 30–50 Ω. Replace if open circuit.",
      "If vibration is continuous/uncontrolled, the control IC (NE555) on the board may have failed — replace it.",
      "If issue persists after the above, replace the complete VIBRO PCB unit.",
    ],
    video: {
      title: "VIBRO Stirrer — Complete Repair & Troubleshooting Guide",
      duration: "8:42",
      views: "12.4K",
      url: "https://www.youtube.com/results?search_query=milk+analyzer+stirrer+vibro+repair",
    },
    followUp: ["Check another issue", "Contact support", "Show more products"],
  },
  "Solar Charger Board": {
    intro: "Let's troubleshoot your **Solar Charger Board** step by step:",
    steps: [
      "Verify the solar panel input voltage (should be 18–24V in sunlight). A low-wattage panel may not charge.",
      "Check the charging LED: green = charging, red = fully charged. If no LED, check the board fuse.",
      "Measure output voltage at the battery terminals — expect 12.6V (full charge for 12V battery).",
      "If voltage is 0, check the Schottky diode (D1) on the board for short circuit.",
      "If battery charges but cuts off early, the over-voltage protection resistor (R3) may need adjustment.",
      "For external battery faults, verify battery health — replace if capacity < 50% (use load test).",
    ],
    video: {
      title: "Solar Charger Board — Voltage Testing & Repair",
      duration: "6:55",
      views: "5.7K",
      url: "https://www.youtube.com/results?search_query=solar+charger+board+milk+analyzer+voltage+repair",
    },
    followUp: ["Check battery", "Check adapter", "Contact support"],
  },
  "Compact Adapter": {
    intro: "Troubleshooting your **Compact Adapter** (zero output / voltage fluctuation):",
    steps: [
      "Check the input supply — ensure 220V AC supply is stable and the plug is secure.",
      "Measure output with a multimeter. Expected: 12V DC ±5%. Zero output = internal fault.",
      "Check the primary fuse inside the adapter housing — replace if blown (500mA, 250V type).",
      "Inspect for burnt components on the PCB — look for dark/discolored capacitors or MOSFETs.",
      "If output fluctuates, the output filter capacitor (C5, 1000µF/25V) may be failing — replace it.",
      "If no output after the above checks, the transformer or switching IC is faulty — replace the adapter unit.",
    ],
    video: {
      title: "Adapter Troubleshooting — Zero Voltage Output Fix",
      duration: "7:20",
      views: "8.1K",
      url: "https://www.youtube.com/results?search_query=milk+analyzer+adapter+zero+output+repair",
    },
    followUp: ["Check ECOD board", "Check battery", "Contact support"],
  },
  "ECOD-DPST Board": {
    intro: "Step-by-step guide for your **ECOD-DPST Board** issue:",
    steps: [
      "For 'Please Wait' loop: do a hard reset (hold power 10s). If persists, reflash the firmware via SD card.",
      "For display issues: check the ribbon cable connection between the board and LCD — re-seat it firmly.",
      "Keypad fault: test each key with the diagnostic mode (hold F1+F3 at boot). Replace keypad membrane if unresponsive.",
      "WiFi/GSM issues: check antenna connectors. For GSM, verify SIM card is seated and operator is active.",
      "SD card errors: format the SD card (FAT32, max 32GB), copy the config file, and retry.",
      "Printer fault: check thermal paper orientation and clean the print head with IPA wipe.",
    ],
    video: {
      title: "ECOD-DPST Board — Display & Keypad Repair Guide",
      duration: "11:15",
      views: "9.1K",
      url: "https://www.youtube.com/results?search_query=ecod+dpst+board+display+keypad+repair",
    },
    followUp: ["Firmware update help", "Check mainboard", "Contact support"],
  },
  Pump: {
    intro: "Troubleshooting your **Pump** unit:",
    steps: [
      "Check the pump motor power — ensure 12V is reaching the motor terminals while running.",
      "If pump doesn't start: check the relay on the control board — use a multimeter to verify it's switching.",
      "Wrong direction: swap the two motor lead wires to reverse rotation.",
      "For sensing errors: clean the flow sensor with distilled water. Check sensor wiring for breaks.",
      "If motor runs but no milk flows: the pump head valves may be clogged — disassemble and clean with warm water.",
      "If motor is hot and stops: thermal protection triggered due to blockage — clear blockage and let cool 5 min.",
    ],
    video: {
      title: "Milk Analyzer Pump — Repair & Maintenance Guide",
      duration: "9:05",
      views: "6.3K",
      url: "https://www.youtube.com/results?search_query=milk+analyzer+pump+repair+troubleshooting",
    },
    followUp: ["Check mainboard", "Check sensor", "Contact support"],
  },
  "Analyzer Mainboard": {
    intro: "Let's troubleshoot your **Analyzer Mainboard** step by step:",
    steps: [
      "T2/Temp error: check the NTC temperature sensor connector on J6 — re-seat or replace the sensor (10KΩ NTC).",
      "For sensor failures: run self-test from Settings > Diagnostics. Note the failing sensor code.",
      "Calibration failure: clean all optical sensors with a dry lens cloth. Recalibrate using the standard solution.",
      "LCD fault: check the display connector ribbon. Test with a spare LCD if available.",
      "WiFi/GSM fault on mainboard: ensure the modem firmware is updated. Check antenna cable continuity.",
      "If multiple errors appear after power: check the 3.3V and 5V regulators on the board — replace if out of spec.",
    ],
    video: {
      title: "Analyzer Mainboard — Calibration & Sensor Troubleshooting",
      duration: "14:30",
      views: "18.2K",
      url: "https://www.youtube.com/results?search_query=milk+analyzer+mainboard+calibration+sensor+repair",
    },
    followUp: ["Calibration steps", "Check ECOD board", "Contact support"],
  },
  Battery: {
    intro: "Here's how to diagnose your **Battery** issue:",
    steps: [
      "Check resting voltage with a multimeter — a healthy 12V battery should read 12.4–12.8V.",
      "Low battery error while plugged in: the charger may not be delivering enough current — check the charger output.",
      "If battery doesn't charge to full: perform a slow charge at 1A for 12–14 hours and retest.",
      "Measure battery capacity under load (connect a 10W bulb) — if voltage drops below 10V, the battery is failing.",
      "Check battery terminals for corrosion — clean with baking soda solution and dry thoroughly.",
      "If battery holds charge for < 2 hours (was 8+ hours), it needs replacement (same spec: 12V 7Ah SLA).",
    ],
    video: {
      title: "Battery Testing & Replacement — Milk Analyzer Guide",
      duration: "5:45",
      views: "4.2K",
      url: "https://www.youtube.com/results?search_query=milk+analyzer+battery+test+replace",
    },
    followUp: ["Check solar charger", "Check adapter", "Contact support"],
  },
};

const FALLBACK_RESPONSE: ChatMessage = {
  id: "fallback",
  role: "bot",
  text: "I can help you troubleshoot all Poornasree milk analyzer products. Please select a product below or describe your issue more specifically (e.g., \"VIBRO not vibrating\" or \"ECOD display blank\").",
  quickReplies: PRODUCTS.map((p) => p.name),
};

function generateResponse(input: string): ChatMessage {
  const lower = input.toLowerCase();
  const matched = PRODUCTS.find((p) => p.keywords.some((k) => lower.includes(k)));
  if (!matched) return { ...FALLBACK_RESPONSE, id: Date.now().toString() };

  const data = RESPONSES[matched.name];
  if (!data) {
    return {
      id: Date.now().toString(),
      role: "bot",
      text: `I found information about **${matched.name}**. Common issues include: ${matched.complaints.join(", ")}. Could you tell me more specifically what's happening?`,
      quickReplies: matched.complaints,
    };
  }

  return {
    id: Date.now().toString(),
    role: "bot",
    text: data.intro,
    steps: data.steps,
    video: data.video,
    quickReplies: data.followUp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────────────────────────────────────────

function makeWelcome(name: string): ChatMessage {
  return {
    id: "welcome",
    role: "bot",
    isWelcome: true,
    text: `Hello ${name}! 👋 I'm **Poornasree AI**, your personal product assistant.\n\nI can provide step-by-step troubleshooting for all milk analyzer products, recommend repair videos, and guide you through common issues. What can I help you with today?`,
    quickReplies: PRODUCTS.map((p) => p.name),
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
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect if not authenticated or not customer
  useEffect(() => {
    if (!isLoading) {
      if (!user) { router.replace("/customer-login"); return; }
      if (user.role !== "customer") { router.replace("/"); return; }
      setMessages([makeWelcome(user.firstName)]);
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 500));
    setIsTyping(false);
    const botResponse = generateResponse(text);
    setMessages((prev) => [...prev, botResponse]);
  };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleQuickReply = (text: string) => sendMessage(text);
  const handleReset = () => {
    if (user) setMessages([makeWelcome(user.firstName)]);
  };

  if (isLoading) return <LoadingScreen message="Loading your portal…" />;
  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Logo variant="full" size="sm" className="hidden sm:flex" />
        <Logo variant="icon" size="sm" className="flex sm:hidden" />

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
              onQuickReply={handleQuickReply}
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
  onQuickReply,
  liked,
  onLike,
}: {
  msg: ChatMessage;
  onQuickReply: (text: string) => void;
  liked: boolean | null | undefined;
  onLike: (v: boolean) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2 items-end">
        <div className="max-w-[80%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-white text-sm font-medium shadow-sm">
          {msg.text}
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
        </div>
      </div>
    );
  }

  // Bot message
  return (
    <div className="flex items-end gap-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary dark:text-primary-300" />
      </div>
      <div className="flex-1 space-y-2.5 max-w-[90%] sm:max-w-[80%]">

        {/* Main text bubble */}
        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm">
          <p className="text-sm text-content dark:text-content-dark whitespace-pre-line leading-relaxed">
            {msg.text.replace(/\*\*(.*?)\*\*/g, "$1")}
          </p>
        </div>

        {/* Step-by-step guidance */}
        {msg.steps && msg.steps.length > 0 && (
          <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 dark:bg-primary-400/5 border-b border-line dark:border-line-dark">
              <Wrench className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
              <span className="text-xs font-bold text-primary dark:text-primary-300 uppercase tracking-wider">
                Step-by-Step Guide
              </span>
            </div>
            <ol className="divide-y divide-line dark:divide-line-dark">
              {msg.steps.map((step, i) => (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-content dark:text-content-dark leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* YouTube video card */}
        {msg.video && (
          <a
            href={msg.video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:border-rose-400 dark:hover:border-rose-400/50 transition-all"
          >
            <div className="shrink-0 w-14 h-14 rounded-xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
              <PlayCircle className="w-7 h-7 text-rose-500 dark:text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-0.5">
                📹 Recommended Video
              </p>
              <p className="text-sm font-semibold text-content dark:text-content-dark group-hover:text-primary dark:group-hover:text-primary-300 transition-colors line-clamp-2">
                {msg.video.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{msg.video.duration}</span>
                <span className="text-xs text-content-secondary dark:text-content-dark-secondary">·</span>
                <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{msg.video.views} views</span>
                <ExternalLink className="w-3 h-3 ml-auto text-content-secondary dark:text-content-dark-secondary group-hover:text-primary transition-colors" />
              </div>
            </div>
          </a>
        )}

        {/* Quick reply chips */}
        {msg.quickReplies && msg.quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => onQuickReply(reply)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content dark:text-content-dark hover:bg-primary/5 dark:hover:bg-primary-400/5 hover:border-primary/40 dark:hover:border-primary-400/40 hover:text-primary dark:hover:text-primary-300 transition-all"
              >
                {reply} <ChevronRight className="w-3 h-3 opacity-50" />
              </button>
            ))}
          </div>
        )}

        {/* Feedback — only for steps responses */}
        {msg.steps && (
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
        )}
      </div>
    </div>
  );
}
