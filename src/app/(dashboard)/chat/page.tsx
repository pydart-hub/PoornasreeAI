"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import { LoadingScreen } from "@/components/ui";
import type { Message, Conversation, VideoResource } from "@/types/chat";
export type { Message, Conversation, VideoResource };

// Normalises API date strings (ISO) → Date objects used by UI components.
function normaliseConversation(raw: {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}): Conversation {
  return {
    id: raw.id,
    title: raw.title ?? "New conversation",
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    messages: raw.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: new Date(m.createdAt),
    })),
  };
}

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // ── Responsive detection ────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Auth guard ──────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
    if (!authLoading && user && user.role === "customer") {
      router.replace("/customer");
    }
  }, [user, authLoading, router]);

  // ── Load conversations from API on mount ────────────────────────
  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setConversations(data.conversations.map(normaliseConversation));
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    }
    load();
  }, [user]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // ── New conversation: clear active state (DB entry created on first message) ──
  const createNewConversation = useCallback(() => {
    setActiveConversationId(null);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Delete conversation via API ──────────────────────────────────
  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) setActiveConversationId(null);
    },
    [activeConversationId]
  );

  const selectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      if (isMobile) setSidebarOpen(false);
    },
    [isMobile]
  );

  // ── Send message ─────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      setInput("");
      setStreaming(true);

      try {
        let convId = activeConversationId;

        // 1. Create conversation in DB if none is active
        if (!convId) {
          const convRes = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: text.trim().slice(0, 50) }),
          });
          if (!convRes.ok) { setStreaming(false); return; }
          const { conversation } = await convRes.json();
          convId = conversation.id as string;
          setConversations((prev) => [normaliseConversation(conversation), ...prev]);
          setActiveConversationId(convId);
        }

        // 2. Optimistically show user bubble
        const tempUserId = `temp-user-${Date.now()}`;
        setConversations((prev) =>
          prev.map((c) =>
            c.id !== convId
              ? c
              : { ...c, messages: [...c.messages, { id: tempUserId, role: "user" as const, content: text.trim(), timestamp: new Date() }], updatedAt: new Date() }
          )
        );

        // 3. Show empty assistant streaming bubble
        const tempBotId = `temp-bot-${Date.now()}`;
        setConversations((prev) =>
          prev.map((c) =>
            c.id !== convId
              ? c
              : { ...c, messages: [...c.messages, { id: tempBotId, role: "assistant" as const, content: "", timestamp: new Date() }] }
          )
        );

        // 4. Persist message to DB
        const msgRes = await fetch("/api/messages", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convId, content: text.trim() }),
        });
        if (!msgRes.ok) { setStreaming(false); return; }
        const { userMessage, assistantMessage, videos } = await msgRes.json() as {
          userMessage: { id: string; createdAt: string };
          assistantMessage: { id: string; content: string; createdAt: string };
          videos: VideoResource[];
        };

        // 5. Replace temp user bubble with persisted record
        setConversations((prev) =>
          prev.map((c) =>
            c.id !== convId
              ? c
              : { ...c, messages: c.messages.map((m) => m.id === tempUserId ? { ...m, id: userMessage.id, timestamp: new Date(userMessage.createdAt) } : m) }
          )
        );

        // 6. Stream assistant reply character by character from DB response
        const fullReply: string = assistantMessage.content;
        const recommendedVideos: VideoResource[] = videos ?? [];
        for (let i = 0; i <= fullReply.length; i++) {
          await new Promise((r) => setTimeout(r, 12));
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempBotId
                    ? i === fullReply.length
                      ? { ...m, id: assistantMessage.id, content: fullReply, timestamp: new Date(assistantMessage.createdAt), videos: recommendedVideos }
                      : { ...m, content: fullReply.slice(0, i) }
                    : m
                ),
              };
            })
          );
        }
      } catch (err) {
        console.error("sendMessage error:", err);
      } finally {
        setStreaming(false);
      }
    },
    [activeConversationId, streaming]
  );

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!user) return null;

  return (
    <div className="h-screen flex overflow-hidden bg-surface dark:bg-surface-dark">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversationId}
        isOpen={sidebarOpen}
        isMobile={isMobile}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelect={selectConversation}
        onNew={createNewConversation}
        onDelete={deleteConversation}
      />

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <ChatWindow
        conversation={activeConversation}
        input={input}
        streaming={streaming}
        onInputChange={setInput}
        onSend={sendMessage}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        userName={user.firstName}
      />
    </div>
  );
}


