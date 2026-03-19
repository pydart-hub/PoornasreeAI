"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";

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
}

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const POLL_INTERVAL = 5000; // 5 seconds

export default function TestChatPage() {
  const [phoneNumber, setPhoneNumber] = useState("919876543210");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const knownCountRef = useRef(0); // track how many DB messages we know about

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Load chat history from server on mount & when phoneNumber changes ──
  const loadHistory = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/simulate/history/${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      const dbMessages: Message[] = (data.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as Message["role"],
        text: m.content,
      }));
      setMessages(dbMessages);
      knownCountRef.current = dbMessages.length;
    } catch {
      // don't block UI on failure
    }
  }, []);

  useEffect(() => {
    if (phoneNumber.trim()) {
      loadHistory(phoneNumber.trim());
    }
  }, [phoneNumber, loadHistory]);

  // ── Poll for new messages (picks up OTP pushed by engineer) ────────────
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
        }));
        // Only update if server has MORE messages (new push from OTP etc.)
        if (dbMessages.length > knownCountRef.current) {
          setMessages(dbMessages);
          knownCountRef.current = dbMessages.length;
        }
      } catch { /* silent */ }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [phoneNumber]);

  async function sendMessage() {
    const text = inputMessage.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/simulate/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, message: text }),
      });

      const data = await res.json();
      const botMsg: Message = {
        role: "bot",
        text: res.ok ? data.message : (data.error ?? "Something went wrong."),
        videos: res.ok && Array.isArray(data.videos) ? data.videos : undefined,
      };
      setMessages((prev) => [...prev, botMsg]);
      knownCountRef.current += 2; // user + bot both persisted on server
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Network error. Could not reach the server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  function resetChat() {
    setMessages([]);
    setInputMessage("");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg flex flex-col gap-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">WhatsApp Simulator</h1>
          <button
            onClick={resetChat}
            className="text-sm px-3 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          >
            Reset Chat
          </button>
        </div>

        {/* Phone Number Input */}
        <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg p-2">
          <span className="text-xs text-gray-500 shrink-0">Phone:</span>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 919876543210"
            className="flex-1 text-sm outline-none text-gray-800"
          />
        </div>

        {/* Chat Window */}
        <div className="bg-white border border-gray-200 rounded-lg h-[480px] overflow-y-auto p-3 flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-auto mb-auto">
              Send a message to start the simulation.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words ${
                  msg.role === "user"
                    ? "bg-blue-100 text-blue-900 rounded-br-sm"
                    : msg.role === "system"
                    ? "bg-yellow-50 text-yellow-900 rounded-bl-sm border border-yellow-200"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {msg.text}
              </div>

              {/* Video suggestion cards */}
              {msg.videos && msg.videos.length > 0 && (
                <div className="mt-2 max-w-[90%] space-y-2">
                  <p className="text-xs text-gray-500 ml-1">📹 Related videos:</p>
                  {msg.videos.map((v) => (
                    <a
                      key={v.id}
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{v.title}</p>
                        {v.description && (
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{v.description}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-500 text-sm px-3 py-2 rounded-xl rounded-bl-sm italic">
                Bot is typing…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || loading}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>

        {/* Quick-reply chips for common test inputs */}
        <div className="flex flex-wrap gap-2">
          {["hi", "skip", "machine not turning on", "no display", "vibration", "yes", "no", "help"].map((chip) => (
            <button
              key={chip}
              onClick={() => setInputMessage(chip)}
              className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            >
              {chip}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
