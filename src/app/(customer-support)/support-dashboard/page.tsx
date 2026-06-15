"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Loading";
import { ResponsiveSidebar, SidebarBrand } from "@/components/ui";
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
  Power
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

interface Toast { id: number; message: string; type: "success" | "info" | "warning"; }

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

  useEffect(() => {
    if (user && (user.role === "customer_support" || user.role === "admin")) {
      fetchSessions();
    }
  }, [user, fetchSessions]);

  useEffect(() => {
    if (activePhone) fetchMessages(activePhone);
  }, [activePhone, fetchMessages]);

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
          // New session might need to be fetched entirely, just refresh for now
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

  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-surface dark:bg-surface-dark">
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={280} className="overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900 via-primary-800 to-primary-900" />
        <div className="relative flex flex-col h-full">
          <SidebarBrand title="WhatsApp Support" onClose={() => setSidebarOpen(false)} />

          <div className="flex-1 flex flex-col overflow-hidden">
             <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-semibold text-white/80">Chats</span>
                <button onClick={fetchSessions} disabled={sessionsLoading} className="text-white/60 hover:text-white">
                    <RefreshCw className={cn("w-4 h-4", sessionsLoading && "animate-spin")} />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto">
               {sessions.length === 0 ? (
                 <div className="p-4 text-center text-sm text-white/50">No chats found.</div>
               ) : (
                 sessions.map(s => {
                   const isActive = s.phoneNumber === activePhone;
                   return (
                     <button
                       key={s.phoneNumber}
                       onClick={() => { setActivePhone(s.phoneNumber); if (isMobile) setSidebarOpen(false); }}
                       className={cn(
                         "w-full text-left px-3 py-3 border-b border-white/5 transition-colors group",
                         isActive ? "bg-white/15 border-l-2 border-l-primary-300" : "hover:bg-white/5 border-l-2 border-l-transparent"
                       )}
                     >
                       <div className="flex items-center justify-between mb-1">
                         <div className="flex items-center gap-2">
                           <Avatar name={s.name} size="sm" />
                           <span className="text-sm font-semibold text-white truncate max-w-[120px]">{s.name}</span>
                         </div>
                         {s.isBotPaused && (
                           <span className="text-[9px] bg-rose-500/80 text-white px-1.5 py-0.5 rounded-full font-bold">PAUSED</span>
                         )}
                       </div>
                       {s.lastMessage && (
                         <div className="text-xs text-white/60 truncate ml-9 flex gap-1">
                           <span className={cn(
                             "font-medium",
                             s.lastMessage.role === "user" ? "text-amber-300" :
                             s.lastMessage.role === "support" ? "text-violet-300" : "text-emerald-300"
                           )}>
                             {s.lastMessage.role === "user" ? "Them: " :
                              s.lastMessage.role === "support" ? "You: " : "Bot: "}
                           </span>
                           <span className="truncate">{s.lastMessage.content}</span>
                         </div>
                       )}
                     </button>
                   );
                 })
               )}
             </div>
          </div>

          <div className="px-3 py-4 border-t border-white/10 shrink-0">
            <button onClick={async () => { await logout(); router.replace("/login"); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 py-3 flex items-center gap-3 z-10">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-content-secondary hover:bg-surface-hover shrink-0">
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-3">
             <h1 className="text-sm font-semibold text-content dark:text-content-dark">Live WhatsApp Monitor</h1>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex overflow-hidden">
           {!activeSession ? (
             <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                <MessageSquare className="w-12 h-12 text-content-tertiary opacity-30" />
                <p className="text-content-secondary font-medium">Select a chat to view</p>
             </div>
           ) : (
             <div className="flex-1 flex flex-col h-full relative bg-[#efeae2] dark:bg-[#0b141a]">
               {/* Chat Header */}
               <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-line shrink-0 z-10 dark:bg-[#202c33] dark:border-white/10 shadow-sm">
                 <div className="flex items-center gap-3">
                   <Avatar name={activeSession.name} size="md" />
                   <div>
                     <p className="font-semibold text-content dark:text-[#e9edef] leading-tight">{activeSession.name}</p>
                     <p className="text-xs text-content-secondary dark:text-[#8696a0]">{activeSession.phoneNumber}</p>
                   </div>
                 </div>
                 <div>
                    <Button 
                      variant={activeSession.isBotPaused ? "primary" : "destructive"} 
                      size="sm"
                      onClick={handleToggleBot}
                      disabled={toggling}
                      icon={activeSession.isBotPaused ? <Power className="w-3.5 h-3.5"/> : <PowerOff className="w-3.5 h-3.5" />}
                    >
                      {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : activeSession.isBotPaused ? "Turn On Chatbot" : "Turn Off Chatbot"}
                    </Button>
                 </div>
               </div>

               {/* Messages */}
               <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                 {messagesLoading && messages.length === 0 ? (
                   <div className="flex justify-center p-4">
                     <Loader2 className="w-5 h-5 animate-spin text-primary" />
                   </div>
                 ) : (
                   messages.map((msg) => {
                     const isUser = msg.role === "user";
                     const isBot = msg.role === "bot";
                     const isSupport = msg.role === "support";
                     
                     return (
                       <div key={msg.id} className={cn("flex w-full", !isUser ? "justify-end" : "justify-start")}>
                         <div className={cn(
                           "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm relative",
                           isUser ? "bg-white text-gray-800 rounded-tl-none dark:bg-[#202c33] dark:text-[#e9edef]" :
                           isBot ? "bg-[#d9fdd3] text-gray-800 rounded-tr-none dark:bg-[#005c4b] dark:text-[#e9edef]" :
                           "bg-violet-100 text-violet-900 rounded-tr-none border border-violet-200 dark:bg-[#322359] dark:text-violet-100 dark:border-violet-500/30"
                         )}>
                           {msg.mediaUrl && (
                             <div className="mb-2 rounded-lg overflow-hidden border border-gray-100 dark:border-white/10 max-w-sm">
                               <img
                                 src={msg.mediaUrl}
                                 alt="Complaint Image"
                                 className="w-full h-auto object-cover max-h-[300px] cursor-pointer hover:opacity-95 transition-opacity"
                                 onClick={() => window.open(msg.mediaUrl!, '_blank')}
                               />
                             </div>
                           )}
                           <p className="whitespace-pre-wrap">{msg.content}</p>
                           <div className="flex items-center justify-end gap-1 mt-1">
                             {isSupport && <span className="text-[10px] opacity-70 font-bold">You</span>}
                             {isBot && <span className="text-[10px] opacity-70 font-bold">Bot</span>}
                             <span className="text-[10px] opacity-60">
                               {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             </span>
                           </div>
                         </div>
                       </div>
                     );
                   })
                 )}
                 <div ref={chatEndRef} />
               </div>

               {/* Composer */}
               <div className="px-4 py-3 bg-surface border-t border-line shrink-0 dark:bg-[#202c33] dark:border-white/10">
                 {activeSession.isBotPaused ? (
                   <div className="flex items-end gap-2">
                     <textarea
                       value={replyText}
                       onChange={(e) => setReplyText(e.target.value)}
                       onKeyDown={onKeySupport}
                       disabled={sending}
                       placeholder="Type a message..."
                       rows={2}
                       className="flex-1 resize-none rounded-xl px-4 py-3 text-sm bg-surface-hover dark:bg-[#2a3942] text-content dark:text-[#e9edef] placeholder:text-content-tertiary focus:outline-none focus:ring-1 focus:ring-primary/50"
                     />
                     <Button variant="primary" size="lg" className="px-4" loading={sending} disabled={!replyText.trim()} onClick={handleSendMessage}>
                       <Send className="w-5 h-5" />
                     </Button>
                   </div>
                 ) : (
                   <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-center">
                     <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Chatbot is currently ON</p>
                     <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-1">
                       Click "Turn Off Chatbot" at the top to take over and send messages manually.
                     </p>
                   </div>
                 )}
               </div>
             </div>
           )}
        </div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            "px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-right-5",
            t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300" :
            t.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-300" :
            "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/30 dark:text-blue-300"
          )}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
