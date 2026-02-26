"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import { LoadingScreen } from "@/components/ui";
import type { Message, Conversation } from "@/types/chat";
export type { Message, Conversation };

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Responsive detection
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

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title: "New conversation",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    if (isMobile) setSidebarOpen(false);
    return newConv.id;
  }, [isMobile]);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
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

  /* ── Send message (mock streaming) ── */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = createNewConversation();
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      // Add user message
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const isFirst = c.messages.length === 0;
          return {
            ...c,
            title: isFirst ? text.trim().slice(0, 50) : c.title,
            messages: [...c.messages, userMsg],
            updatedAt: new Date(),
          };
        })
      );

      setInput("");
      setStreaming(true);

      // Mock assistant response (will be replaced by real API call)
      const botId = crypto.randomUUID();
      const mockResponse = getMockResponse(text);

      // Add empty assistant message
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: botId,
                role: "assistant",
                content: "",
                timestamp: new Date(),
              },
            ],
            updatedAt: new Date(),
          };
        })
      );

      // Simulate streaming character by character
      for (let i = 0; i <= mockResponse.length; i++) {
        await new Promise((r) => setTimeout(r, 15));
        const partial = mockResponse.slice(0, i);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === botId ? { ...m, content: partial } : m
              ),
            };
          })
        );
      }

      setStreaming(false);
    },
    [activeConversationId, createNewConversation, streaming]
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

/* ── Mock response helper (replaced by API later) ── */
function getMockResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("vibro") || q.includes("analyzer")) {
    return `Based on the troubleshooting documentation, here's what I found:

**VIBRO Milk Analyzer — Common Issues**

1. **Check the power supply connection** — Ensure the adapter is properly plugged in and the LED indicator is on.
2. **Verify calibration settings** — Go to Settings → Calibration → Run Auto-Calibrate.
3. **Clean the sample chamber** — Use distilled water to flush the measurement cell.

If the issue persists, please provide more details about the specific error message or behavior you're observing.

*Sources: Training Syllabus — VIBRO section*`;
  }

  if (q.includes("battery") || q.includes("charge")) {
    return `Here's the troubleshooting guide for battery and charging issues:

**Battery & Charger Troubleshooting**

1. **Check the charger adapter** — Verify the output voltage matches the required specification (typically 12V DC).
2. **Inspect the battery terminals** — Look for corrosion or loose connections.
3. **Test with a multimeter** — Measure the battery voltage; it should read above 11.5V when charged.

Would you like me to walk you through any of these steps in more detail?

*Sources: Training Syllabus — BATTERY, CHARGER ADAPTER sections*`;
  }

  return `Thank you for your question! I'm Poornasree AI, your technical support assistant for milk analyzer equipment.

I can help you with:
- **Troubleshooting** equipment issues (VIBRO, SOLAR CHARGER, COMPACT ADAPTER, etc.)
- **Step-by-step repair guides** with detailed instructions
- **Calibration procedures** for various analyzer models
- **Maintenance schedules** and best practices

Could you provide more details about the specific equipment or issue you're facing? The more information you share, the better I can assist you.`;
}
