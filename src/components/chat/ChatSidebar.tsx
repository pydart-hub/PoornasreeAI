"use client";

import { useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  Search,
  LogOut,
} from "lucide-react";
import { Logo, ThemeToggle, Avatar } from "@/components/ui";
import ResponsiveSidebar from "@/components/ui/ResponsiveSidebar";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn, truncate } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function ChatSidebar({
  conversations,
  activeId,
  isOpen,
  onToggle,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group conversations by date
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: Conversation[] }[] = [];
  const todayItems = filtered.filter(
    (c) => c.updatedAt.toDateString() === today.toDateString()
  );
  const yesterdayItems = filtered.filter(
    (c) => c.updatedAt.toDateString() === yesterday.toDateString()
  );
  const weekItems = filtered.filter(
    (c) =>
      c.updatedAt > weekAgo &&
      c.updatedAt.toDateString() !== today.toDateString() &&
      c.updatedAt.toDateString() !== yesterday.toDateString()
  );
  const olderItems = filtered.filter((c) => c.updatedAt <= weekAgo);

  if (todayItems.length) groups.push({ label: "Today", items: todayItems });
  if (yesterdayItems.length)
    groups.push({ label: "Yesterday", items: yesterdayItems });
  if (weekItems.length)
    groups.push({ label: "Previous 7 Days", items: weekItems });
  if (olderItems.length) groups.push({ label: "Older", items: olderItems });

  return (
    <ResponsiveSidebar open={isOpen} onClose={onToggle} width={280}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-line dark:border-line-dark shrink-0">
        <Logo variant="icon" size="sm" />
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            title="Toggle sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New chat button */}
      <div className="p-3 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content dark:text-content-dark text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary dark:text-content-dark-secondary" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-input dark:bg-surface-dark-input border border-line dark:border-line-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 dark:placeholder:text-content-dark-secondary/50 focus-ring transition-colors"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-8 h-8 text-content-secondary/30 dark:text-content-dark-secondary/30 mb-3" />
            <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
              {search ? "No matching conversations" : "No conversations yet"}
            </p>
            {!search && (
              <p className="text-xs text-content-secondary/60 dark:text-content-dark-secondary/60 mt-1">
                Start a new chat to begin
              </p>
            )}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-2 py-1.5 text-xs font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider">
              {group.label}
            </p>
            {group.items.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  "w-full group flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors relative",
                  conv.id === activeId
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300"
                    : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
                <span className="truncate flex-1">
                  {truncate(conv.title, 30)}
                </span>
                {(hoveredId === conv.id || conv.id === activeId) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-content-secondary hover:text-red-500 transition-colors"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-line dark:border-line-dark p-3 space-y-2">
        {/* Theme toggle */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
            Theme
          </span>
          <ThemeToggle />
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors group">
          <Avatar
            name={`${user?.firstName || ""} ${user?.lastName || ""}`}
            size="sm"
            status="online"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-content dark:text-content-dark truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">
              {user?.email}
            </p>
          </div>
          <button
            onClick={logout}
            className="shrink-0 p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </ResponsiveSidebar>
  );
}
