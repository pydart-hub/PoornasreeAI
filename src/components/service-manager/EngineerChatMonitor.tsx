"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  MessageSquare,
  Search,
  RefreshCw,
  User,
  Phone,
  Mail,
  MapPin,
  Ticket,
  Clock,
  Shield,
  Bot,
  ExternalLink,
  ChevronRight,
  Eye,
  CheckCheck,
  Check,
  Loader2,
  AlertCircle,
  Menu,
  PanelRightClose,
  PanelRight,
  Smile,
  Paperclip,
  Mic,
  MoreVertical,
  X,
  Play,
  Film,
} from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import { calculateWarrantyStatus } from "@/lib/warranty";

interface EngineerSession {
  id: string;
  engineerId: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  activeTickets: number;
  pincodes: Array<{ code: string; place?: string | null; district?: string | null }>;
  lastMessage: {
    role: string;
    content: string;
    createdAt: string;
  } | null;
  messageCount: number;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  mediaUrl?: string | null;
  createdAt: string;
}

interface ActiveTicket {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  machineWarranty?: number | null;
  machineInvoiceDate?: string | null;
  createdAt: string;
  place?: string | null;
  pincode?: { code: string; place?: string | null } | null;
}

interface EngineerChatMonitorProps {
  onToggleSidebar?: () => void;
  onOpenTicket?: (ticketId: string) => void;
}

/** Format message text with WhatsApp style markdown */
function formatWhatsAppText(text: string) {
  if (!text) return null;

  // Split lines
  const lines = text.split("\n");

  return lines.map((line, lineIdx) => {
    // Check if line contains URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRegex);

    const formattedParts = parts.map((part, partIdx) => {
      if (part.match(urlRegex)) {
        const isYoutube = part.includes("youtu.be") || part.includes("youtube.com");
        return (
          <a
            key={partIdx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#027eb5] dark:text-[#53bdeb] underline font-medium hover:opacity-80 inline-flex items-center gap-1 break-all"
          >
            {isYoutube && <Film className="w-3.5 h-3.5 shrink-0 inline text-rose-500" />}
            {part}
          </a>
        );
      }

      // Format *bold*
      let rendered: (string | JSX.Element)[] = [part];
      if (part.includes("*")) {
        const boldParts = part.split(/\*([^*]+)\*/g);
        rendered = boldParts.map((bp, bpIdx) =>
          bpIdx % 2 === 1 ? (
            <strong key={bpIdx} className="font-semibold text-content dark:text-content-dark">
              {bp}
            </strong>
          ) : (
            bp
          )
        );
      }

      return <span key={partIdx}>{rendered}</span>;
    });

    return (
      <span key={lineIdx} className="block min-h-[1.25rem]">
        {formattedParts}
      </span>
    );
  });
}

/** Format timestamp for WhatsApp chat list */
function formatChatListTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function EngineerChatMonitor({ onToggleSidebar, onOpenTicket }: EngineerChatMonitorProps) {
  const [sessions, setSessions] = useState<EngineerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);

  // Selected chat details
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch engineer sessions
  const fetchSessions = async (keepSelection = true) => {
    try {
      const res = await fetch("/api/manager/engineer-chats/sessions", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const list: EngineerSession[] = data.sessions || [];
        setSessions(list);
        if (!keepSelection || !selectedEngineerId) {
          if (list.length > 0) {
            setSelectedEngineerId(list[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load engineer sessions:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSessions(false);
  }, []);

  // Fetch conversation messages when selected engineer changes
  useEffect(() => {
    if (!selectedEngineerId) {
      setChatMessages([]);
      setActiveTickets([]);
      return;
    }

    let isCancelled = false;
    setChatLoading(true);

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/manager/engineer-chats/messages/${selectedEngineerId}`, {
          credentials: "include",
        });
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setChatMessages(data.messages || []);
          setActiveTickets(data.activeTickets || []);
          setTimeout(scrollToBottom, 80);
        }
      } catch (err) {
        console.error("Failed to load engineer messages:", err);
      } finally {
        if (!isCancelled) setChatLoading(false);
      }
    };

    loadMessages();
    return () => {
      isCancelled = true;
    };
  }, [selectedEngineerId]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        (s.phoneNumber && s.phoneNumber.includes(q)) ||
        s.email.toLowerCase().includes(q) ||
        s.pincodes.some((p) => p.code.includes(q) || (p.place && p.place.toLowerCase().includes(q)))
      );
    });
  }, [sessions, search]);

  const activeSession = sessions.find((s) => s.id === selectedEngineerId);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f0f2f5] dark:bg-[#111b21] select-text">
      {/* ═══════════════════ LEFT PANEL: CHAT LIST ═══════════════════ */}
      <div className="w-[380px] shrink-0 flex flex-col h-full bg-white dark:bg-[#111b21] border-r border-[#d1d7db] dark:border-[#222d34]">
        {/* WhatsApp Top Header */}
        <div className="h-[60px] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] px-4 flex items-center justify-between border-b border-[#d1d7db] dark:border-[#222d34]">
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-1.5 rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title="Toggle Sidebar Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] leading-tight">
                Chats
              </h2>
              <p className="text-[11px] text-[#00a884] font-medium leading-tight">
                Engineer Monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[#54656f] dark:text-[#aebac1]">
            <button
              onClick={() => {
                setRefreshing(true);
                fetchSessions(true);
              }}
              disabled={refreshing}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Refresh conversations"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin text-[#00a884]")} />
            </button>
          </div>
        </div>

        {/* WhatsApp Search Input Bar */}
        <div className="p-2 bg-white dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#202c33]">
          <div className="relative flex items-center bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-[#54656f] dark:text-[#8696a0] shrink-0 mr-3" />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-transparent text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#8696a0] outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Chat List Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f2f2f2] dark:divide-[#202c33]/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-[#667781] dark:text-[#8696a0]">
              <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
              <span className="text-xs">Loading WhatsApp contacts...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#667781] dark:text-[#8696a0]">
              No service engineers found.
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isSelected = session.id === selectedEngineerId;
              const hasMessages = session.messageCount > 0;
              const initials = session.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase() || "SE";

              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedEngineerId(session.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 flex items-center gap-3 transition-colors relative",
                    isSelected
                      ? "bg-[#f0f2f5] dark:bg-[#2a3942]"
                      : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-[#dfe5e7] dark:bg-[#374248] text-[#54656f] dark:text-[#cfd6da] flex items-center justify-center font-bold text-sm">
                      {initials}
                    </div>
                    {hasMessages && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#25d366] border-2 border-white dark:border-[#111b21]" />
                    )}
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                        {session.name}
                      </span>
                      {session.lastMessage?.createdAt && (
                        <span
                          className={cn(
                            "text-[11px] shrink-0",
                            hasMessages
                              ? "text-[#00a884] font-medium"
                              : "text-[#667781] dark:text-[#8696a0]"
                          )}
                        >
                          {formatChatListTime(session.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 text-[13px] text-[#667781] dark:text-[#8696a0]">
                      <div className="flex items-center gap-1 truncate">
                        {session.lastMessage?.role === "user" && (
                          <CheckCheck className="w-3.5 h-3.5 shrink-0 text-[#53bdeb]" />
                        )}
                        <span className="truncate">
                          {session.lastMessage
                            ? session.lastMessage.content.replace(/\*/g, "")
                            : session.phoneNumber || "No conversation yet"}
                        </span>
                      </div>

                      {session.activeTickets > 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#25d366] text-white">
                          {session.activeTickets}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════ CENTER: CHAT CANVAS ═══════════════════ */}
      <div className="flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a] relative overflow-hidden">
        {/* Authentic WhatsApp Doodle Pattern Background */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }}
        />

        {activeSession ? (
          <>
            {/* Top WhatsApp Conversation Bar */}
            <div className="h-[60px] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] px-4 flex items-center justify-between border-b border-[#d1d7db] dark:border-[#222d34] z-10 shadow-sm">
              <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setShowInfoDrawer((v) => !v)}
              >
                <div className="w-10 h-10 rounded-full bg-[#dfe5e7] dark:bg-[#374248] text-[#54656f] dark:text-[#cfd6da] flex items-center justify-center font-bold text-sm shrink-0">
                  {activeSession.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] truncate leading-tight">
                    {activeSession.name}
                  </h3>
                  <p className="text-[11px] text-[#667781] dark:text-[#8696a0] truncate leading-tight mt-0.5">
                    {activeSession.phoneNumber
                      ? `Service Engineer · ${activeSession.phoneNumber}`
                      : "Service Engineer · Online"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[#54656f] dark:text-[#aebac1]">
                <button
                  onClick={() => setShowInfoDrawer((v) => !v)}
                  className={cn(
                    "p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors",
                    showInfoDrawer && "text-[#00a884] bg-black/5 dark:bg-white/10"
                  )}
                  title="Contact info & active tickets"
                >
                  <PanelRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Messages Timeline */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 z-10">
              {/* Top Security / Audit Pill */}
              <div className="flex justify-center my-3">
                <div className="max-w-md bg-[#ffeecd] dark:bg-[#182229] text-[#54656f] dark:text-[#ffd279] text-[11px] px-3 py-1.5 rounded-lg shadow-sm text-center leading-relaxed border border-[#ffd279]/30">
                  🔒 Messages are logged from the live Poornasree WhatsApp Bot. Service Manager inspection mode is read-only.
                </div>
              </div>

              {chatLoading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-2 text-[#667781] dark:text-[#8696a0]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                  <span className="text-xs">Loading interaction log...</span>
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center max-w-sm mx-auto p-6 text-[#667781] dark:text-[#8696a0]">
                  <Bot className="w-10 h-10 mb-2 opacity-40 text-[#00a884]" />
                  <h5 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] mb-1">
                    No Messages Found
                  </h5>
                  <p className="text-xs">
                    {activeSession.name} has not exchanged messages with the Poornasree WhatsApp assistant yet.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isUser = msg.role === "user"; // Engineer
                  const isSystem = msg.role === "system";

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <div className="bg-white/90 dark:bg-[#182229]/90 text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-lg shadow-sm border border-black/5 dark:border-white/5">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }

                  const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={msg.id}
                      className={cn("flex flex-col my-1", isUser ? "items-end" : "items-start")}
                    >
                      <div
                        className={cn(
                          "relative max-w-[82%] sm:max-w-[70%] px-3.5 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
                          isUser
                            ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tr-none"
                            : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-lg rounded-tl-none border border-[#e9edef]/60 dark:border-transparent"
                        )}
                      >
                        {/* Sender Label */}
                        <div
                          className={cn(
                            "text-[11px] font-semibold mb-1 select-none",
                            isUser
                              ? "text-[#008069] dark:text-[#25d366]"
                              : "text-[#027eb5] dark:text-[#53bdeb]"
                          )}
                        >
                          {isUser ? activeSession.name : "Poornasree Support Bot"}
                        </div>

                        {/* Content formatted with WhatsApp markdown */}
                        <div className="whitespace-pre-wrap break-words">
                          {formatWhatsAppText(msg.content)}
                        </div>

                        {/* Timestamp & double checkmarks */}
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10.5px] text-[#667781] dark:text-[#8696a0] select-none float-right ml-4">
                          <span>{timeStr}</span>
                          {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Real WhatsApp Input Style Bar */}
            <div className="h-[62px] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] px-4 flex items-center gap-3 border-t border-[#d1d7db] dark:border-[#222d34] z-10">
              <Smile className="w-6 h-6 text-[#54656f] dark:text-[#8696a0] cursor-not-allowed opacity-60" />
              <Paperclip className="w-5 h-5 text-[#54656f] dark:text-[#8696a0] cursor-not-allowed opacity-60" />

              <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg px-4 py-2 flex items-center justify-between text-xs text-[#54656f] dark:text-[#8696a0] border border-[#e9edef] dark:border-transparent">
                <span className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#00a884]" />
                  <span>Read-only inspection mode (Service Manager audit)</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a884]/15 text-[#00a884] uppercase tracking-wider">
                  Live Audit
                </span>
              </div>

              <Mic className="w-5 h-5 text-[#54656f] dark:text-[#8696a0] cursor-not-allowed opacity-60" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#667781] dark:text-[#8696a0] z-10">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30 text-[#00a884]" />
            <h4 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef] mb-1">
              Poornasree WhatsApp Web
            </h4>
            <p className="text-xs max-w-sm">
              Select an engineer from the left panel to inspect their live bot chat queries, tickets, and customer updates.
            </p>
          </div>
        )}
      </div>

      {/* ═══════════════════ RIGHT: WHATSAPP CONTACT INFO DRAWER ═══════════════════ */}
      {activeSession && showInfoDrawer && (
        <div className="w-[360px] shrink-0 h-full bg-white dark:bg-[#111b21] border-l border-[#d1d7db] dark:border-[#222d34] flex flex-col overflow-y-auto animate-slide-in-right">
          {/* Header */}
          <div className="h-[60px] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] px-4 flex items-center justify-between border-b border-[#d1d7db] dark:border-[#222d34]">
            <h4 className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">
              Contact info
            </h4>
            <button
              onClick={() => setShowInfoDrawer(false)}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[#54656f] dark:text-[#8696a0] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Profile Big Card */}
          <div className="p-6 text-center border-b border-[#f2f2f2] dark:border-[#202c33] bg-white dark:bg-[#111b21]">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#dfe5e7] dark:bg-[#374248] text-[#54656f] dark:text-[#cfd6da] flex items-center justify-center font-bold text-2xl shadow-inner mb-3">
              {activeSession.name.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="text-base font-bold text-[#111b21] dark:text-[#e9edef]">
              {activeSession.name}
            </h3>
            <p className="text-xs text-[#00a884] font-medium mt-0.5">
              Service Engineer
            </p>
            <p className="text-xs text-[#667781] dark:text-[#8696a0] font-mono mt-1">
              {activeSession.phoneNumber || "No phone configured"}
            </p>
          </div>

          {/* Details / Contact */}
          <div className="p-4 border-b border-[#f2f2f2] dark:border-[#202c33] space-y-3">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#667781] dark:text-[#8696a0]">
              About and Contact
            </h5>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-3 text-[#111b21] dark:text-[#e9edef]">
                <Phone className="w-4 h-4 text-[#00a884] shrink-0" />
                <span className="font-mono">{activeSession.phoneNumber || "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-[#111b21] dark:text-[#e9edef]">
                <Mail className="w-4 h-4 text-[#00a884] shrink-0" />
                <span className="truncate">{activeSession.email}</span>
              </div>
            </div>

            {/* Zones */}
            {activeSession.pincodes.length > 0 && (
              <div className="pt-2">
                <span className="text-[11px] text-[#667781] dark:text-[#8696a0] block mb-1.5 font-medium">
                  Assigned Zones ({activeSession.pincodes.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {activeSession.pincodes.map((p) => (
                    <span
                      key={p.code}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0f2f5] dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] border border-[#d1d7db]/60 dark:border-[#222d34]"
                    >
                      {p.place ? `${p.place} (${p.code})` : p.code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active Field Tickets Section */}
          <div className="p-4 flex-1 space-y-3 bg-[#f0f2f5]/40 dark:bg-[#111b21]">
            <div className="flex items-center justify-between">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#667781] dark:text-[#8696a0]">
                Active Field Tickets ({activeTickets.length})
              </h5>
            </div>

            {activeTickets.length === 0 ? (
              <div className="p-4 text-center rounded-xl bg-white dark:bg-[#202c33] border border-[#d1d7db]/60 dark:border-[#222d34] text-xs text-[#667781] dark:text-[#8696a0]">
                No pending tickets assigned to this engineer.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeTickets.map((t) => {
                  const warranty = calculateWarrantyStatus(t.machineWarranty, t.machineInvoiceDate);
                  return (
                    <div
                      key={t.id}
                      onClick={() => onOpenTicket && onOpenTicket(t.id)}
                      className={cn(
                        "p-3 rounded-xl border border-[#d1d7db] dark:border-[#222d34] bg-white dark:bg-[#202c33] space-y-1.5 transition-all hover:border-[#00a884] hover:shadow-sm",
                        onOpenTicket && "cursor-pointer"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[#00a884] font-mono">
                          #{t.ticketNumber}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          {t.status}
                        </span>
                      </div>

                      {t.machineSerialNumber && (
                        <div className="text-[11px] font-mono text-[#54656f] dark:text-[#8696a0]">
                          S/N: {t.machineSerialNumber}
                        </div>
                      )}

                      {warranty.hasWarranty && (
                        <div>
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full font-medium border inline-flex items-center gap-1",
                              warranty.badgeClass
                            )}
                          >
                            <Shield className="w-2.5 h-2.5" />
                            {warranty.label}
                          </span>
                        </div>
                      )}

                      <p className="text-[11px] text-[#111b21] dark:text-[#e9edef] truncate">
                        {t.problemDescription}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-[#667781] dark:text-[#8696a0] pt-1 border-t border-[#f2f2f2] dark:border-[#222d34]">
                        <span>{t.place || t.pincode?.place || "Kerala"}</span>
                        <span>{formatRelativeTime(new Date(t.createdAt))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
