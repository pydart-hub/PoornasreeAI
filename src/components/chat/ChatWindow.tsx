"use client";

import { useRef, useEffect, useMemo, useState, FormEvent, KeyboardEvent } from "react";
import {
  Send,
  PanelLeft,
  Sparkles,
  ArrowDown,
  Copy,
  Check,
  Wrench,
  Zap,
  HelpCircle,
  BookOpen,
  Youtube,
} from "lucide-react";
import { Logo, Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@/types/chat";

interface ChatWindowProps {
  conversation: Conversation | undefined;
  input: string;
  streaming: boolean;
  onInputChange: (val: string) => void;
  onSend: (text: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  userName: string;
}

const SUGGESTIONS = [
  {
    icon: <Wrench className="w-5 h-5" />,
    title: "Troubleshoot Equipment",
    subtitle: "Diagnose and fix common issues",
    prompt: "My VIBRO milk analyzer is showing inconsistent readings. How can I troubleshoot this?",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Calibration Guide",
    subtitle: "Step-by-step calibration procedures",
    prompt: "How do I calibrate the milk analyzer for fat and SNF measurements?",
  },
  {
    icon: <HelpCircle className="w-5 h-5" />,
    title: "Battery Issues",
    subtitle: "Power and charging solutions",
    prompt: "The battery on my analyzer is not charging properly. What should I check?",
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    title: "Maintenance Tips",
    subtitle: "Keep your equipment running",
    prompt: "What is the recommended maintenance schedule for a VIBRO milk analyzer?",
  },
];

export default function ChatWindow({
  conversation,
  input,
  streaming,
  onInputChange,
  onSend,
  onToggleSidebar,
  sidebarOpen,
  userName,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !streaming) {
      onSend(input);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* ── Header ── */}
      <header className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
              title="Open sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary dark:text-primary-400" />
            <h1 className="text-sm font-semibold text-content dark:text-content-dark">
              Poornasree AI
            </h1>
          </div>
        </div>
        <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
          Model: Phi-3 Mini
        </span>
      </header>

      {/* ── Messages area ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        {messages.length === 0 ? (
          /* ── Welcome screen ── */
          <div className="flex flex-col items-center justify-center h-full px-4 py-12 animate-fade-in">
            <Logo variant="full" size="lg" className="mb-6" />

            <h2 className="text-2xl sm:text-3xl font-bold text-content dark:text-content-dark text-center mb-2">
              Hi {userName}, how can I help?
            </h2>
            <p className="text-content-secondary dark:text-content-dark-secondary text-center max-w-md mb-10">
              I&apos;m your AI assistant for milk analyzer technical support.
              Ask me anything about troubleshooting, calibration, or maintenance.
            </p>

            {/* Suggestion cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => onSend(s.prompt)}
                  className="flex items-start gap-3 p-4 rounded-2xl border border-line dark:border-line-dark hover:border-primary/30 dark:hover:border-primary-400/30 hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-left transition-all group"
                >
                  <div className="shrink-0 p-2 rounded-xl bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-400 group-hover:bg-primary/20 dark:group-hover:bg-primary-400/20 transition-colors">
                    {s.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-content dark:text-content-dark">
                      {s.title}
                    </p>
                    <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                      {s.subtitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                userName={userName}
                onCopy={copyToClipboard}
                isCopied={copiedId === msg.id}
                isStreaming={
                  streaming &&
                  msg.id === messages[messages.length - 1]?.id &&
                  msg.role === "assistant"
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute -top-12 left-1/2 -translate-x-1/2 p-2 rounded-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content-secondary dark:text-content-dark-secondary transition-all animate-fade-in"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Input area ── */}
      <div className="shrink-0 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-3 sm:p-4 safe-bottom">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto"
        >
          <div className="relative flex items-end gap-2 p-2 rounded-2xl border border-line dark:border-line-dark bg-surface-input dark:bg-surface-dark-input focus-within:border-primary dark:focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary/20 dark:focus-within:ring-primary-400/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about troubleshooting, calibration, maintenance..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 dark:placeholder:text-content-dark-secondary/50 px-2 py-2 focus:outline-none max-h-[200px]"
            />
            <button
              type="submit"
              disabled={streaming || input.trim() === ""}
              className={cn(
                "shrink-0 p-2.5 rounded-xl transition-all",
                !streaming && input.trim() !== ""
                  ? "bg-primary hover:bg-primary-700 text-white shadow-sm"
                  : "text-content-secondary/40 dark:text-content-dark-secondary/40 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-content-secondary/50 dark:text-content-dark-secondary/50 text-center mt-2">
            Poornasree AI can make mistakes. Verify important information with the official documentation.
          </p>
        </form>
      </div>
    </div>
  );
}

/* ── Message Bubble Component ── */
function MessageBubble({
  message,
  userName,
  onCopy,
  isCopied,
  isStreaming,
}: {
  message: Message;
  userName: string;
  onCopy: (text: string, id: string) => void;
  isCopied: boolean;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Bot avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary-400/10 flex items-center justify-center mt-1">
          <Sparkles className="w-4 h-4 text-primary dark:text-primary-400" />
        </div>
      )}

      <div
        className={cn(
          "relative group max-w-[85%] sm:max-w-[75%]",
          isUser ? "order-first" : ""
        )}
      >
        {/* Bubble */}
        <div
          className={cn(
            "px-4 py-3 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-bubble-user dark:bg-bubble-dark-user text-white rounded-br-md"
              : "bg-bubble-bot dark:bg-bubble-dark-bot text-content dark:text-content-dark rounded-bl-md"
          )}
        >
          {/* Render markdown-like content */}
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-inherit">
            <MessageContent content={message.content} />
          </div>

          {/* Streaming indicator */}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current opacity-70 animate-blink ml-0.5 -mb-0.5 rounded-sm" />
          )}
        </div>

        {/* Actions (bot messages only) */}
        {!isUser && message.content && !isStreaming && (
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onCopy(message.content, message.id)}
              className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
              title="Copy response"
            >
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Video recommendations */}
        {!isUser && !isStreaming && message.videos && message.videos.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider pl-1">
              Related Videos
            </p>
            {message.videos.map((v) => {
              const videoId = (() => {
                try {
                  const u = new URL(v.youtubeUrl);
                  if (u.hostname === "youtu.be") return u.pathname.slice(1);
                  return u.searchParams.get("v") ?? "";
                } catch { return ""; }
              })();
              const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
              const isPlaying = playingVideoId === v.id;
              return (
                <div key={v.id} className="rounded-xl border border-red-200 dark:border-red-500/30 overflow-hidden">
                  {isPlaying && videoId ? (
                    <div className="w-full aspect-video">
                      <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlayingVideoId(v.id)}
                      className="flex items-center gap-3 p-2.5 w-full text-left bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors group/vid"
                    >
                      <div className="relative shrink-0">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={v.title}
                            className="w-16 h-11 object-cover rounded-lg bg-red-100 dark:bg-red-500/20"
                          />
                        ) : (
                          <div className="w-16 h-11 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                            <Youtube className="w-5 h-5 text-red-500" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-7 h-7 rounded-full bg-red-600/90 flex items-center justify-center shadow">
                            <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5 pl-0.5"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300 line-clamp-2 leading-tight">
                          {v.title}
                        </p>
                        {v.description && (
                          <p className="text-[11px] sm:text-[10px] text-red-500 dark:text-red-400 mt-0.5 line-clamp-1">{v.description}</p>
                        )}
                      </div>
                      <Youtube className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 opacity-70 group-hover/vid:opacity-100" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <Avatar name={userName} size="sm" className="shrink-0 mt-1" />
      )}
    </div>
  );
}

/* ── Simple markdown rendering ── */
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Split into lines and render basic markdown
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-5 space-y-1">
          {listItems.map((item, i) => (
            <li key={i}>
              <InlineFormat text={item} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      const text = trimmed.replace(/^\d+\.\s*/, "");
      if (!inList) {
        inList = true;
      }
      listItems.push(text);
      return;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s*/, "");
      if (!inList) {
        inList = true;
      }
      listItems.push(text);
      return;
    }

    flushList();

    // Empty line
    if (!trimmed) {
      elements.push(<br key={`br-${i}`} />);
      return;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="font-semibold mt-3 mb-1">
          <InlineFormat text={trimmed.slice(4)} />
        </h4>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="font-bold text-base mt-3 mb-1">
          <InlineFormat text={trimmed.slice(3)} />
        </h3>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={i}>
        <InlineFormat text={trimmed} />
      </p>
    );
  });

  flushList();
  return <>{elements}</>;
}

/* ── Inline formatting (bold, italic, code) ── */
function InlineFormat({ text }: { text: string }) {
  // Replace **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded bg-surface-hover dark:bg-surface-dark-hover text-xs font-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
