"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Send, RotateCcw, Phone, Settings, X } from "lucide-react";

interface VideoSuggestion {
  id: string;
  title: string;
  url: string;
  description?: string | null;
}

interface Message {
  role: "user" | "bot" | "system";
  text: string;
  videos?: VideoSuggestion[];
  ts: Date;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const POLL_INTERVAL = 2000;

/** Extract "1. Option" / "2. Option" lines from bot text → tappable buttons */
function extractOptions(text: string): string[] {
  const opts: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\*?(\d+)[.)]\*?\s+(.+)$/);
    if (m && m[2].trim().length < 60) opts.push(m[2].trim());
  }
  return opts;
}

function fmt(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function TestChatPage() {
  const [phoneNumber, setPhoneNumber] = useState("919876543210");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const knownCountRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadHistory = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/simulate/history/${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      const dbMessages: Message[] = (data.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as Message["role"],
        text: m.content,
        ts: new Date(),
      }));
      setMessages(dbMessages);
      knownCountRef.current = dbMessages.length;
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (phoneNumber.trim()) loadHistory(phoneNumber.trim());
  }, [phoneNumber, loadHistory]);

  useEffect(() => {
    if (!phoneNumber.trim()) return;
    const phone = phoneNumber.trim();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/simulate/history/${encodeURIComponent(phone)}`);
        if (!res.ok) return;
        const data = await res.json();
        const dbMessages: Message[] = (data.messages || []).map((m: { role: string; content: string }) => ({
          role: m.role as Message["role"],
          text: m.content,
          ts: new Date(),
        }));
        if (dbMessages.length > knownCountRef.current) {
          setMessages(dbMessages);
          knownCountRef.current = dbMessages.length;
        }
      } catch { /* silent */ }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [phoneNumber]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? inputMessage).trim();
    if (!msg || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: msg, ts: new Date() }]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/simulate/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: res.ok ? data.message : (data.error ?? "Something went wrong."),
          videos: res.ok && Array.isArray(data.videos) ? data.videos : undefined,
          ts: new Date(),
        },
      ]);
      knownCountRef.current += 2;
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Network error. Could not reach the server.", ts: new Date() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputMessage, loading, phoneNumber]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  const QUICK_CHIPS = ["Hi", "Skip", "Yes", "No", "Help", "Machine not turning on", "No display", "Vibration"];

  return (
    <div className="flex flex-col h-[100dvh] bg-[#e5ddd5] dark:bg-[#0d1117]">

      {/* ── WhatsApp-style header ── */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-[#075e54] shadow-md z-10">
        <div className="w-9 h-9 rounded-full bg-[#25d366]/30 flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">Poornasree AI</p>
          <p className="text-[#b2dfdb] text-xs truncate">
            {loading ? "typing…" : "+91 " + phoneNumber.replace(/^91/, "")}
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <Settings className="w-4 h-4 text-white/80" />
        </button>
        <button
          onClick={() => { setMessages([]); setInputMessage(""); knownCountRef.current = 0; }}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          title="Reset chat"
        >
          <RotateCcw className="w-4 h-4 text-white/80" />
        </button>
      </header>

      {/* ── Settings dropdown ── */}
      {showSettings && (
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="text-xs text-gray-500 shrink-0">Phone number:</span>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 919876543210"
            className="flex-1 text-sm outline-none text-gray-800 dark:text-gray-200 bg-transparent border-b border-gray-300 dark:border-gray-600 pb-0.5 focus:border-[#075e54]"
          />
          <button onClick={() => setShowSettings(false)}>
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* ── Chat area ── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c9c9' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="flex justify-center mt-8">
            <div className="bg-[#e1f3fb] dark:bg-[#1a3040] text-[#4a9aba] dark:text-[#7ecbeb] text-xs px-4 py-2 rounded-full shadow-sm text-center max-w-xs">
              Messages are end-to-end simulated. Say hi to start!
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div key={i} className="flex justify-center my-2">
                <span className="bg-[#e1f3fb] dark:bg-[#1a3040] text-[#4a9aba] text-xs px-3 py-1 rounded-full shadow-sm">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const options = !isUser ? extractOptions(msg.text) : [];

          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
              <div className={`max-w-[82%] sm:max-w-[65%] ${isUser ? "" : ""}`}>
                {/* Bubble */}
                <div
                  className={`relative px-3 pt-2 pb-1.5 rounded-2xl shadow-sm ${
                    isUser
                      ? "bg-[#dcf8c6] dark:bg-[#005c4b] text-gray-900 dark:text-gray-100 rounded-tr-sm"
                      : "bg-white dark:bg-[#1f2c34] text-gray-900 dark:text-gray-100 rounded-tl-sm"
                  }`}
                >
                  {/* Tail */}
                  {isUser ? (
                    <span className="absolute -right-1.5 top-0 w-3 h-3 overflow-hidden">
                      <svg viewBox="0 0 10 10" className="fill-[#dcf8c6] dark:fill-[#005c4b]">
                        <path d="M0 0 Q10 0 10 10 L0 0z" />
                      </svg>
                    </span>
                  ) : (
                    <span className="absolute -left-1.5 top-0 w-3 h-3 overflow-hidden">
                      <svg viewBox="0 0 10 10" className="fill-white dark:fill-[#1f2c34]">
                        <path d="M10 0 Q0 0 0 10 L10 0z" />
                      </svg>
                    </span>
                  )}

                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                  <p className={`text-[10px] mt-0.5 text-right ${isUser ? "text-green-700/60 dark:text-green-300/50" : "text-gray-400 dark:text-gray-500"}`}>
                    {fmt(msg.ts)}
                    {isUser && <span className="ml-1 text-blue-500">✓✓</span>}
                  </p>
                </div>

                {/* In-message option buttons (WhatsApp Business style) */}
                {options.length > 0 && (
                  <div className="mt-1 bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-sm overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-700">
                    {options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => sendMessage(opt)}
                        disabled={loading}
                        className="w-full px-4 py-2.5 text-sm text-[#0b99d5] dark:text-[#53bdeb] font-medium text-center hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Video suggestions */}
                {msg.videos && msg.videos.length > 0 && (
                  <div className="mt-1.5 space-y-1.5">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1">📹 Related videos:</p>
                    {msg.videos.map((v) => (
                      <a
                        key={v.id}
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#1f2c34] border border-gray-200 dark:border-gray-700 hover:border-[#25d366]/60 hover:shadow-sm transition-all group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 group-hover:bg-red-100 transition-colors">
                          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{v.title}</p>
                          {v.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{v.description}</p>}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start mb-1">
            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick chips ── */}
      <div className="shrink-0 bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto scrollbar-none">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => sendMessage(chip)}
            disabled={loading}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-[#075e54]/30 dark:border-[#25d366]/30 bg-white dark:bg-gray-800 text-[#075e54] dark:text-[#25d366] hover:bg-[#075e54]/5 dark:hover:bg-[#25d366]/10 active:scale-95 transition-all disabled:opacity-40 font-medium"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* ── Input area ── */}
      <div className="shrink-0 bg-[#f0f0f0] dark:bg-[#1f2c34] px-3 py-2.5 flex items-end gap-2">
        <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-[24px] flex items-center px-4 py-2 min-h-[44px] shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            disabled={loading}
            className="flex-1 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none bg-transparent"
          />
        </div>
        <button
          onClick={() => sendMessage()}
          disabled={loading}
          className="w-11 h-11 rounded-full bg-[#25d366] hover:bg-[#1da855] active:bg-[#128c4e] disabled:bg-gray-300 dark:disabled:bg-gray-600 flex items-center justify-center shadow-md transition-all active:scale-95 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>

    </div>
  );
}

