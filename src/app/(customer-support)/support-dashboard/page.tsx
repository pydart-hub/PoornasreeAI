"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Loading";
import { ResponsiveSidebar, SidebarBrand, Logo } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import { getSocket, closeSocket } from "@/lib/socket-client";
import {
  LogOut,
  RefreshCw,
  Send,
  Loader2,
  PanelLeft,
  Menu,
  MessageSquare,
  ChevronLeft,
  PowerOff,
  Power,
  User as UserIcon,
  MapPin,
  Mail,
  Shield,
  Wrench,
  FileText,
  Calendar,
  Check,
  CheckCheck,
  PanelRightClose,
  PanelRight,
  ShieldAlert,
  Award,
  Clock,
  ExternalLink,
  ChevronRight,
  AlertTriangle
} from "lucide-react";

interface SessionData {
  id: string;
  phoneNumber: string;
  state: string;
  isRegistered: boolean;
  serialNumber: string | null;
  machineId: string | null;
  metadata: any;
  isBotPaused: boolean;
  supportAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  name: string;
  lastMessage?: any;
}

interface ChatMessage {
  id: string;
  phoneNumber: string;
  role: string; // "user" | "bot" | "support" | "system"
  content: string;
  mediaUrl?: string | null;
  createdAt: string;
}

interface CustomerProfile {
  name: string;
  email: string | null;
  phone: string;
  role: string;
  location: string;
}

interface CustomerTicket {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  createdAt: string;
  engineerName: string | null;
}

interface CustomerMachine {
  serialNumber: string;
  modelName: string;
  invoiceNo: string;
  invoiceDate: string;
  warrantyMonths: number;
  createdAt: string;
}

interface CustomerContextData {
  profile: CustomerProfile;
  tickets: CustomerTicket[];
  machines: CustomerMachine[];
}

interface Toast { id: number; message: string; type: "success" | "info" | "warning"; }

const getStateConfig = (state: string) => {
  const s = (state || "GREETING").toUpperCase();
  if (s.includes("GREET") || s === "START") {
    return { bg: "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-500/30", label: "Greeting" };
  }
  if (s.includes("TROUBLE") || s.includes("DIAG")) {
    return { bg: "bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30", label: "Diagnostics" };
  }
  if (s.includes("TICKET") || s.includes("BOOK")) {
    return { bg: "bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-500/30", label: "Ticket Booking" };
  }
  if (s.includes("WARRANTY")) {
    return { bg: "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30", label: "Warranty Check" };
  }
  return { bg: "bg-gray-50 dark:bg-white/10 text-gray-600 dark:text-white/70 border-gray-200 dark:border-white/15", label: state };
};

const getWarrantyStatus = (invoiceDateStr: string, warrantyMonths: number) => {
  if (!invoiceDateStr || invoiceDateStr === "N/A" || !warrantyMonths) {
    return { label: "No Warranty Info", active: false, bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
  }
  try {
    const invoiceDate = new Date(invoiceDateStr);
    if (isNaN(invoiceDate.getTime())) {
      return { label: "No Warranty Info", active: false, bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
    }
    const expiryDate = new Date(invoiceDate);
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
    const today = new Date();
    const isActive = today <= expiryDate;
    
    const remainingTime = expiryDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
    
    if (isActive) {
      return {
        label: `Active (${remainingDays}d left)`,
        active: true,
        bg: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-[#00a884] dark:border-[#00a884]/35"
      };
    } else {
      return {
        label: "Expired",
        active: false,
        bg: "bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/35"
      };
    }
  } catch {
    return { label: "No Warranty Info", active: false, bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
  }
};

const getTicketStatusBadge = (status: string) => {
  const s = (status || "").toUpperCase();
  if (s === "PENDING" || s === "OPEN") {
    return "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35";
  }
  if (s === "ASSIGNED" || s === "IN_PROGRESS" || s === "INPROGRESS") {
    return "bg-blue-500/10 text-blue-600 border border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/35";
  }
  if (s === "RESOLVED") {
    return "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/35";
  }
  return "bg-gray-500/10 text-gray-600 border border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/35";
};

const safeFormatRelativeTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "N/A";
  return formatRelativeTime(d);
};

export default function SupportDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);

  // New UI/UX states
  const [activeTab, setActiveTab] = useState<"all" | "manual" | "bot">("all");
  const [contextOpen, setContextOpen] = useState(true);
  const [customerContext, setCustomerContext] = useState<CustomerContextData | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && user.role !== "customer_support" && user.role !== "admin") router.replace("/");
  }, [user, authLoading, router]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++toastId.current;
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const r = await fetch("/api/support-chat/sessions", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setSessions(d.sessions);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (phone: string) => {
    setMessagesLoading(true);
    try {
      const r = await fetch(`/api/support-chat/messages/${phone}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages);
      }
    } catch {
      addToast("Failed to fetch messages", "warning");
    } finally {
      setMessagesLoading(false);
    }
  }, [addToast]);

  const fetchCustomerContext = useCallback(async (phone: string) => {
    setContextLoading(true);
    try {
      const r = await fetch(`/api/support-chat/customer-context/${phone}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setCustomerContext(d);
      }
    } catch {
      addToast("Failed to fetch customer profile", "warning");
    } finally {
      setContextLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (user && (user.role === "customer_support" || user.role === "admin")) {
      fetchSessions();
    }
  }, [user, fetchSessions]);

  useEffect(() => {
    if (activePhone) {
      fetchMessages(activePhone);
      fetchCustomerContext(activePhone);
    } else {
      setCustomerContext(null);
    }
  }, [activePhone, fetchMessages, fetchCustomerContext]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user || (user.role !== "customer_support" && user.role !== "admin")) return;
    const sock = getSocket({ userId: user.id, role: user.role, name: user.firstName });
    
    sock.on("support-chat:message", (data: { phoneNumber: string; message: ChatMessage }) => {
      // Update sidebar latest message
      setSessions((prev) => {
        const idx = prev.findIndex(s => s.phoneNumber === data.phoneNumber);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lastMessage: data.message, updatedAt: new Date().toISOString() };
          // Move to top
          const [item] = updated.splice(idx, 1);
          updated.unshift(item);
          return updated;
        } else {
          // Refresh sessions to get new details
          fetchSessions();
          return prev;
        }
      });
      
      // Update chat messages if this chat is active
      if (data.phoneNumber === activePhone) {
        setMessages(p => [...p, data.message]);
      } else {
        if (data.message.role === "user") {
          addToast(`New message from ${data.phoneNumber}`, "info");
        }
      }
    });

    return () => {
      sock.off("support-chat:message");
      closeSocket();
    };
  }, [user, activePhone, fetchSessions, addToast]);

  const activeSession = sessions.find((s) => s.phoneNumber === activePhone) ?? null;

  const handleToggleBot = async () => {
    if (!activeSession || toggling) return;
    setToggling(true);
    try {
      const newStatus = !activeSession.isBotPaused;
      const r = await fetch(`/api/support-chat/toggle-bot/${activeSession.phoneNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBotPaused: newStatus })
      });
      if (!r.ok) throw new Error();
      
      setSessions(p => p.map(s => s.phoneNumber === activeSession.phoneNumber ? { ...s, isBotPaused: newStatus } : s));
      addToast(newStatus ? "Chatbot is now OFF. You are in manual mode." : "Chatbot is now ON. Auto-replies enabled.", "success");
    } catch {
      addToast("Failed to toggle chatbot", "warning");
    } finally {
      setToggling(false);
    }
  };

  const handleSendMessage = async () => {
    if (!replyText.trim() || !activePhone || sending) return;
    setSending(true);
    const text = replyText.trim();
    setReplyText("");
    try {
      const r = await fetch(`/api/support-chat/send-message/${activePhone}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setReplyText(text);
      addToast("Failed to send message", "warning");
    } finally {
      setSending(false);
    }
  };

  const onKeySupport = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (activeTab === "manual") return s.isBotPaused;
    if (activeTab === "bot") return !s.isBotPaused;
    return true;
  });

  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-surface dark:bg-surface-dark">
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={280} className="overflow-hidden bg-white dark:bg-[#111b21]">
        <div className="relative flex flex-col h-full bg-white dark:bg-[#111b21] transition-colors duration-200">
          
          {/* Theme-Aware WhatsApp Sidebar Brand */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-[#e9edef] dark:border-[#222d34] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] transition-colors duration-200">
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-white dark:bg-white/5 border border-[#e9edef] dark:border-white/10 flex items-center justify-center flex-shrink-0 p-1 w-9 h-9">
                <Logo variant="flower" size="sm" className="w-full h-full" priority />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] leading-tight truncate">WhatsApp Support</p>
                <p className="text-[10px] text-[#667781] dark:text-[#8696a0] font-medium truncate">Poornasree AI</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-white/5 transition-colors shrink-0"
              title="Close sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
             {/* Chats title bar */}
             <div className="px-4 py-3 bg-white dark:bg-[#111b21] flex items-center justify-between transition-colors duration-200">
                <span className="text-sm font-bold text-[#111b21] dark:text-[#e9edef]">Chats</span>
                <button 
                  onClick={fetchSessions} 
                  disabled={sessionsLoading} 
                  className="text-[#54656f] dark:text-[#aebac1] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-transform active:rotate-180"
                  title="Refresh chats"
                >
                    <RefreshCw className={cn("w-4 h-4", sessionsLoading && "animate-spin")} />
                </button>
             </div>
             
             {/* WhatsApp Filters Capsule Pills */}
             <div className="px-3 py-2 bg-white dark:bg-[#111b21] flex gap-2 text-xs border-b border-[#e9edef] dark:border-[#222d34] transition-colors duration-200">
                {(["all", "manual", "bot"] as const).map((tab) => {
                  const label = tab === "all" ? "All" : tab === "manual" ? "Manual" : "Bot Active";
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-3 py-1 rounded-full transition-all font-medium text-xs border-0",
                        isActive
                          ? "bg-[#e7f7ef] dark:bg-[#0a332c] text-[#008069] dark:text-[#00a884] font-semibold"
                          : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#2a3942]"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
             </div>
             
             {/* Chat List Queue */}
             <div className="flex-1 overflow-y-auto scrollbar-thin bg-white dark:bg-[#111b21] transition-colors duration-200">
                {filteredSessions.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[#667781] dark:text-white/40">No sessions match active filters.</div>
                ) : (
                  filteredSessions.map(s => {
                    const isActive = s.phoneNumber === activePhone;
                    const stateConfig = getStateConfig(s.state);
                    return (
                      <button
                        key={s.phoneNumber}
                        onClick={() => { setActivePhone(s.phoneNumber); if (isMobile) setSidebarOpen(false); }}
                        className={cn(
                          "w-full text-left px-4 py-3.5 border-b border-[#f0f2f5] dark:border-[#222d34] transition-all duration-150 flex flex-col gap-2 relative",
                          isActive 
                            ? "bg-[#e9edef] dark:bg-[#2a3942]" 
                            : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] bg-white dark:bg-[#111b21]"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={s.name} size="sm" className="shrink-0" />
                            <span className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] truncate max-w-[130px]">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {s.isBotPaused ? (
                              <span className="text-[8px] bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Manual</span>
                            ) : (
                              <span className="text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Bot</span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-center w-full">
                          <span className={cn("text-[9px] font-bold border px-1.5 py-0.5 rounded-md", stateConfig.bg)}>
                            {stateConfig.label}
                          </span>
                          <span className="text-[9px] text-[#667781] dark:text-white/40 font-medium">
                            {safeFormatRelativeTime(s.updatedAt)}
                          </span>
                        </div>

                        {s.lastMessage && (
                          <div className="text-xs text-[#667781] dark:text-white/60 truncate w-full flex gap-1.5 items-center mt-0.5">
                            <span className={cn(
                              "font-bold text-[8px] uppercase tracking-wider px-1 py-0.2 rounded shrink-0",
                              s.lastMessage.role === "user" ? "bg-amber-100 dark:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20" :
                              s.lastMessage.role === "support" ? "bg-[#e7f7ef] dark:bg-[#0a332c] text-[#008069] dark:text-[#00a884] border border-[#008069]/20 dark:border-[#00a884]/20" :
                              s.lastMessage.role === "system" ? "bg-gray-100 dark:bg-gray-500/25 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-500/20" : 
                              "bg-[#e7f7ef] dark:bg-[#0a332c] text-[#008069] dark:text-[#00a884] border border-[#008069]/20 dark:border-[#00a884]/20"
                            )}>
                              {s.lastMessage.role === "user" ? "User" :
                               s.lastMessage.role === "support" ? "Agent" :
                               s.lastMessage.role === "system" ? "Sys" : "Bot"}
                            </span>
                            <span className="truncate flex-1 font-light text-[#667781] dark:text-[#8696a0]">{s.lastMessage.content}</span>
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
             </div>
          </div>

          {/* Theme-Aware Footer */}
          <div className="px-3 py-4 border-t border-[#e9edef] dark:border-[#222d34] shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] transition-colors duration-200">
            <button onClick={async () => { await logout(); router.replace("/login"); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-[#54656f] dark:text-white/50 hover:text-[#111b21] dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      <main className="flex-1 flex flex-col overflow-hidden bg-background dark:bg-background-dark">
        {/* Main Dashboard Header */}
        <header className="shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#2f3b43] px-4 py-3 flex items-center justify-between gap-3 z-10 shadow-sm transition-colors duration-200">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-[#54656f] dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-white/10 shrink-0 transition-colors">
                {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
              </button>
            )}
            <div className="min-w-0 flex items-center gap-2">
               <span className="w-2.5 h-2.5 rounded-full bg-[#008069] dark:bg-[#00a884] animate-pulse shrink-0" />
               <h1 className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] tracking-tight">Live WhatsApp Support</h1>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex overflow-hidden">
           {!activeSession ? (
             <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-6 bg-[#efeae2] dark:bg-[#0b141a]">
                <div className="w-16 h-16 rounded-full bg-[#e7f7ef] dark:bg-[#0a332c] flex items-center justify-center animate-bounce duration-1000">
                  <MessageSquare className="w-8 h-8 text-[#008069] dark:text-[#00a884] opacity-80" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef]">Support Monitor</h2>
                  <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-1 max-w-[280px]">Select a customer conversation from the queue to start manual override, check warranty and manage service tickets.</p>
                </div>
             </div>
           ) : (
             <div className="flex-1 flex overflow-hidden">
               {/* Chat Pane */}
               <div className="flex-1 flex flex-col h-full relative bg-[#efeae2] dark:bg-[#0b141a] min-w-0">
                 {/* Chat Header */}
                 <div className="flex items-center justify-between px-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#222d34] shrink-0 z-10 shadow-sm transition-colors duration-200">
                   <div className="flex items-center gap-3">
                     <Avatar name={activeSession.name} size="md" />
                     <div>
                       <p className="font-semibold text-gray-800 dark:text-[#e9edef] leading-tight">{activeSession.name}</p>
                       <p className="text-xs text-gray-500 dark:text-[#8696a0]">{activeSession.phoneNumber}</p>
                     </div>
                   </div>
                   
                   <div className="flex items-center gap-2">
                     <Button 
                       variant={activeSession.isBotPaused ? "primary" : "destructive"} 
                       size="sm"
                       onClick={handleToggleBot}
                       disabled={toggling}
                       icon={activeSession.isBotPaused ? <Power className="w-3.5 h-3.5"/> : <PowerOff className="w-3.5 h-3.5" />}
                     >
                       {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : activeSession.isBotPaused ? "Turn On Bot" : "Pause Bot"}
                     </Button>

                     <button
                       onClick={() => setContextOpen(!contextOpen)}
                       className="p-2 rounded-lg text-[#54656f] dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors shrink-0"
                       title={contextOpen ? "Hide Info" : "Show Info"}
                     >
                       {contextOpen ? (
                         <PanelRightClose className="w-4 h-4 text-[#008069] dark:text-[#00a884]" />
                       ) : (
                         <PanelRight className="w-4 h-4 text-[#54656f] dark:text-[#aebac1]" />
                       )}
                     </button>
                   </div>
                 </div>

                 {/* Messages Scroll Area */}
                 <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 scrollbar-thin">
                   {messagesLoading && messages.length === 0 ? (
                     <div className="flex justify-center p-8">
                       <Loader2 className="w-6 h-6 animate-spin text-primary dark:text-[#00a884]" />
                     </div>
                   ) : (
                     messages.map((msg) => {
                       const isUser = msg.role === "user";
                       const isOutgoing = !isUser;

                       if (msg.role === "system") {
                         return (
                           <div key={msg.id} className="flex w-full justify-center my-3 animate-in fade-in duration-300">
                             <div className="bg-[#ffeecd] text-[#54656f] dark:bg-[#182229] dark:text-[#8696a0] text-[11px] font-semibold px-4 py-1.5 rounded-lg border border-[#b3e5fc]/30 dark:border-white/5 shadow-sm max-w-[85%] text-center tracking-wide">
                               {msg.content}
                             </div>
                           </div>
                         );
                       }
                       
                       return (
                         <div key={msg.id} className={cn("flex w-full animate-in fade-in duration-200", isOutgoing ? "justify-end" : "justify-start")}>
                           <div className={cn(
                             "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm relative transition-all",
                             isOutgoing 
                               ? "bg-[#d9fdd3] text-[#303030] rounded-tr-none dark:bg-[#005c4b] dark:text-[#e9edef]" 
                               : "bg-white text-[#111b21] rounded-tl-none dark:bg-[#202c33] dark:text-[#e9edef]"
                           )}>
                             {msg.mediaUrl && (
                               <div className="mb-2 rounded-xl overflow-hidden border border-gray-200/50 dark:border-white/10 max-w-xs transition-all duration-300 hover:shadow-md hover:scale-[1.02] group relative">
                                 <img
                                   src={msg.mediaUrl}
                                   alt="Complaint Attachment"
                                   className="w-full h-auto object-cover max-h-[220px] cursor-zoom-in transition-transform duration-300 group-hover:brightness-90"
                                   onClick={() => setZoomedImage(msg.mediaUrl!)}
                                 />
                                 <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                   <span className="text-white text-xs font-semibold bg-black/60 px-2 py-1 rounded-md flex items-center gap-1.5 shadow">
                                     <ExternalLink className="w-3.5 h-3.5" /> View Large
                                   </span>
                                 </div>
                               </div>
                             )}
                             <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                             <div className="flex items-center justify-end gap-1.5 mt-1 opacity-70">
                               {msg.role === "support" && <span className="text-[10px] font-bold text-[#008069] dark:text-[#00a884]">You</span>}
                               {msg.role === "bot" && <span className="text-[10px] font-bold text-[#667781] dark:text-[#8696a0]">Bot</span>}
                               <span className="text-[10px] font-light text-[#667781] dark:text-[#8696a0]">
                                 {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                               </span>
                               {isOutgoing && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0" />}
                             </div>
                           </div>
                         </div>
                       );
                     })
                   )}
                   <div ref={chatEndRef} />
                 </div>

                 {/* Message Composer Area */}
                 <div className="px-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-[#e9edef] dark:border-[#222d34] shrink-0 shadow-inner transition-colors duration-200">
                   {activeSession.isBotPaused ? (
                     <div className="flex items-end gap-2 animate-in slide-in-from-bottom-2 duration-150">
                       <textarea
                         value={replyText}
                         onChange={(e) => setReplyText(e.target.value)}
                         onKeyDown={onKeySupport}
                         disabled={sending}
                         placeholder="Type your reply to customer..."
                         rows={2}
                         className="flex-1 resize-none rounded-xl px-4 py-3 text-sm bg-white dark:bg-[#2a3942] text-gray-800 dark:text-[#e9edef] placeholder:text-gray-400 dark:placeholder:text-[#8696a0] focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all border border-gray-200 dark:border-[#2a3942]"
                       />
                       <Button variant="primary" size="lg" className="px-4 h-[50px] rounded-xl bg-primary hover:bg-primary-hover dark:bg-[#00a884] dark:hover:bg-[#008f72] border-0" loading={sending} disabled={!replyText.trim()} onClick={handleSendMessage}>
                         <Send className="w-5 h-5 text-white" />
                       </Button>
                     </div>
                   ) : (
                     <div className="bg-[#ffeecd] dark:bg-[#182229] border border-[#ffeecd]/50 dark:border-white/5 rounded-xl p-3 text-center animate-in fade-in duration-200 shadow-sm">
                       <p className="text-xs text-[#54656f] dark:text-amber-200 font-semibold flex items-center justify-center gap-1.5">
                         <AlertTriangle className="w-4 h-4 shrink-0 text-[#008069] dark:text-[#00a884]" />
                         Chatbot Auto-Response is active
                       </p>
                       <p className="text-[11px] text-[#54656f]/80 dark:text-[#8696a0] mt-1">
                         To reply manually, click <strong className="font-semibold">"Pause Bot"</strong> in the top header.
                       </p>
                     </div>
                   )}
                 </div>
               </div>

               {/* Right Drawer (Context Panel) */}
               {contextOpen && (
                 <div className="w-[360px] border-l border-[#e9edef] dark:border-[#2f3b43] bg-white dark:bg-[#121b22] flex flex-col h-full overflow-hidden shrink-0 animate-in slide-in-from-right duration-200 z-10 shadow-xl">
                    <div className="px-4 py-3.5 border-b border-[#e9edef] dark:border-[#2f3b43] flex items-center justify-between bg-[#f0f2f5] dark:bg-[#202c33] shrink-0 transition-colors duration-200">
                      <span className="font-semibold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2 text-sm">
                        <UserIcon className="w-4 h-4 text-[#008069] dark:text-[#00a884]" />
                        Customer Context
                      </span>
                      <button
                        onClick={() => setContextOpen(false)}
                        className="text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors p-1 rounded-md hover:bg-gray-200 dark:hover:bg-white/5"
                      >
                        <PanelRightClose className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
                      {contextLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-primary dark:text-[#00a884]" />
                          <span className="text-xs text-[#667781] dark:text-[#8696a0]">Loading customer info...</span>
                        </div>
                      ) : !customerContext ? (
                        <div className="text-center py-12 text-[#667781] dark:text-[#8696a0] text-sm">
                          No profiles matching this number.
                        </div>
                      ) : (
                        <>
                          {/* Profile details */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={customerContext.profile.name} size="lg" className="shadow-sm" />
                              <div>
                                <h3 className="font-bold text-base text-[#111b21] dark:text-[#e9edef] leading-tight">
                                  {customerContext.profile.name}
                                </h3>
                                <Badge variant="secondary" className="mt-1 capitalize bg-primary/10 text-primary border-primary/20 dark:bg-[#00a884]/20 dark:text-[#00a884] dark:border-[#00a884]/30">
                                  {customerContext.profile.role}
                                </Badge>
                              </div>
                            </div>
                            
                            <div className="space-y-2.5 text-xs text-[#667781] dark:text-[#8696a0] bg-gray-50 dark:bg-[#202c33]/40 p-3.5 rounded-xl border border-gray-200/60 dark:border-line-dark shadow-sm">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Mail className="w-3.5 h-3.5 text-primary/70 dark:text-[#00a884]/70 shrink-0" />
                                <span className="truncate flex-1">{customerContext.profile.email || "No email linked"}</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <UserIcon className="w-3.5 h-3.5 text-primary/70 dark:text-[#00a884]/70 shrink-0" />
                                <span>{customerContext.profile.phone}</span>
                              </div>
                              <div className="flex items-start gap-2.5 min-w-0">
                                <MapPin className="w-3.5 h-3.5 text-primary/70 dark:text-[#00a884]/70 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 leading-relaxed flex-1">{customerContext.profile.location}</span>
                              </div>
                            </div>
                          </div>

                          {/* Machine Details */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] flex items-center gap-1.5 border-b border-gray-200 dark:border-[#2f3b43] pb-1">
                              <Wrench className="w-3.5 h-3.5 text-content-secondary" />
                              Registered Machines ({customerContext.machines.length})
                            </h4>
                            {customerContext.machines.length === 0 ? (
                              <p className="text-xs text-[#667781]/80 dark:text-[#8696a0]/70 italic bg-gray-50 dark:bg-[#202c33]/25 p-3.5 rounded-xl border border-gray-200/50 dark:border-line-dark/50 text-center">
                                No machines registered.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {customerContext.machines.map((machine) => {
                                  const warranty = getWarrantyStatus(machine.invoiceDate, machine.warrantyMonths);
                                  return (
                                    <div key={machine.serialNumber} className="bg-white border border-gray-200 dark:border-[#2f3b43] dark:bg-[#202c33]/60 p-3.5 rounded-xl shadow-sm space-y-2 hover:border-[#008069] dark:hover:border-[#00a884] transition-colors">
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                          <p className="font-bold text-xs text-[#111b21] dark:text-[#e9edef] line-clamp-1">{machine.modelName}</p>
                                          <p className="text-[10px] text-[#667781] dark:text-[#8696a0] font-mono mt-0.5 tracking-wide">S/N: {machine.serialNumber}</p>
                                        </div>
                                        <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 tracking-wide", warranty.bg)}>
                                          {warranty.label}
                                        </span>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-[#667781] dark:text-[#8696a0] pt-2 border-t border-gray-150 dark:border-[#2f3b43]/45">
                                        <div>
                                          <span className="opacity-70">Invoice:</span> {machine.invoiceNo}
                                        </div>
                                        <div>
                                          <span className="opacity-70">Date:</span> {machine.invoiceDate !== "N/A" ? new Date(machine.invoiceDate).toLocaleDateString() : "N/A"}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Service Tickets */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] flex items-center gap-1.5 border-b border-gray-200 dark:border-[#2f3b43] pb-1">
                              <FileText className="w-3.5 h-3.5 text-content-secondary" />
                              Tickets History ({customerContext.tickets.length})
                            </h4>
                            {customerContext.tickets.length === 0 ? (
                              <p className="text-xs text-[#667781]/80 dark:text-[#8696a0]/70 italic bg-gray-50 dark:bg-[#202c33]/25 p-3.5 rounded-xl border border-gray-200/50 dark:border-line-dark/50 text-center">
                                No past support tickets.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {customerContext.tickets.map((ticket) => (
                                  <div key={ticket.id} className="bg-white border border-gray-200 dark:border-[#2f3b43] dark:bg-[#202c33]/60 p-3.5 rounded-xl shadow-sm space-y-2 hover:border-[#008069] dark:hover:border-[#00a884] transition-colors">
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="font-mono text-[10px] text-primary dark:text-[#00a884] font-bold">
                                        #{ticket.ticketNumber}
                                      </span>
                                      <span className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0", getTicketStatusBadge(ticket.status))}>
                                        {ticket.status}
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#54656f] dark:text-[#e9edef] line-clamp-2 leading-relaxed">{ticket.problemDescription}</p>
                                    <div className="flex justify-between items-center text-[10px] text-[#667781] dark:text-[#8696a0] pt-2 border-t border-gray-150 dark:border-[#2f3b43]/45">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {new Date(ticket.createdAt).toLocaleDateString()}
                                      </span>
                                      {ticket.engineerName ? (
                                        <span className="flex items-center gap-1 font-semibold text-[#111b21] dark:text-[#e9edef]">
                                          <Wrench className="w-3 h-3 text-[#00a884]" />
                                          {ticket.engineerName}
                                        </span>
                                      ) : (
                                        <span className="italic text-[9px] opacity-75">Unassigned</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                 </div>
               )}
             </div>
           )}
        </div>
      </main>

      {/* Lightbox / Media Viewer */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors focus:outline-none"
            onClick={() => setZoomedImage(null)}
          >
            <PanelRightClose className="w-6 h-6 rotate-90" />
          </button>
          <div 
            className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomedImage} 
              alt="Attachment full view" 
              className="w-full h-full object-contain max-h-[80vh] animate-in zoom-in-95 duration-200"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <a 
                href={zoomedImage} 
                target="_blank" 
                rel="noreferrer" 
                className="bg-white/15 hover:bg-white/25 border border-white/10 text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-lg backdrop-blur"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            "px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-right-5",
            t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300" :
            t.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300" :
            "bg-blue-50 border-blue-200 text-blue-800 dark:bg-[#00a884]/20 dark:border-[#00a884]/30 dark:text-[#00a884]"
          )}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
