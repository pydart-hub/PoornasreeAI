"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/Loading";
import { SidebarBrand } from "@/components/ui";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  RefreshCw,
  Ticket,
  Play,
  KeyRound,
  CheckCircle2,
  Loader2,
  ArrowRight,
  MapPin,
  Clock,
  Briefcase,
  Home,
  User,
  LogOut,
  Wrench,
  PanelLeftClose,
  Menu,
} from "lucide-react";
import { useIsMobile } from "@/lib/useMediaQuery";
import { getSocket } from "@/lib/socket-client";

// ── Types ──────────────────────────────────────────────────────────────
type TicketStatus = "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  status: TicketStatus;
  problemDescription: string;
  issueDescription?: string | null;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  machineProductCode?: string | null;
  machineCustomer?: string | null;
  machineAddress1?: string | null;
  machineAddress2?: string | null;
  ageHours?: number;
  createdAt: string;
  updatedAt: string;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedManager?: { firstName: string; lastName?: string | null } | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
  phoneNumber?: string | null;
  customerAddress?: string | null;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; badgeBg: string; badgeText: string; dot: string }> = {
  ASSIGNED:    { label: "New",         badgeBg: "bg-blue-100",   badgeText: "text-blue-700",   dot: "bg-blue-500"    },
  IN_PROGRESS: { label: "In Progress", badgeBg: "bg-amber-100",  badgeText: "text-amber-700",  dot: "bg-amber-500"   },
  PENDING_OTP: { label: "Verify OTP",  badgeBg: "bg-purple-100", badgeText: "text-purple-700", dot: "bg-purple-500"  },
  CLOSED:      { label: "Done",        badgeBg: "bg-green-100",  badgeText: "text-green-700",  dot: "bg-emerald-500" },
};

const TABS: { key: TicketStatus; label: string }[] = [
  { key: "ASSIGNED",    label: "New" },
  { key: "IN_PROGRESS", label: "Active" },
  { key: "PENDING_OTP", label: "OTP" },
  { key: "CLOSED",      label: "Done" },
];

// ── Parse structured problemDescription ────────────────────────────────
function parseDescription(desc: string) {
  const pairs: Record<string, string> = {};
  for (const line of desc.split("\n")) {
    const m = line.match(/^([^:\n]+?):\s*(.+)$/);
    if (m) pairs[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const isStructured = Object.keys(pairs).length >= 2;
  return {
    isStructured,
    customerName: pairs["customer"] || pairs["customer name"] || undefined,
    location:
      pairs["location"] ||
      [pairs["address1"], pairs["address2"]].filter(Boolean).join(", ") ||
      [pairs["place"], pairs["district"], pairs["state"]].filter(Boolean).join(", ") ||
      undefined,
    phone: pairs["phone"] || undefined,
  };
}

// ── Left accent border by age ─────────────────────────────────────────
function getAccentBorder(ageHours?: number): string {
  if (typeof ageHours !== "number") return "border-l-4 border-l-gray-100";
  if (ageHours > 24) return "border-l-4 border-l-red-500";
  if (ageHours >= 6) return "border-l-4 border-l-amber-400";
  return "border-l-4 border-l-gray-100";
}

// ── OTP handling moved to /service/[id] work screen ──────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ═══════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TicketStatus>("ASSIGNED");
  const [allTickets, setAllTickets] = useState<ServiceTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { setMounted(true); }, []);

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && !["service", "admin", "service_engineer"].includes(user.role))
      router.replace("/");
  }, [user, authLoading, router]);

  // ── Fetch all tickets once ─────────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAllTickets(data.tickets || []);
      }
    } catch { /* non-fatal */ }
    finally { setTicketsLoading(false); }
  }, []);

  useEffect(() => {
    if (user) fetchTickets();
  }, [user, fetchTickets]);

  // ── Real-time ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const socket = getSocket({
      userId: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName || ""}`.trim(),
    });
    const refresh = () => fetchTickets();
    socket.on("ticket:assigned", refresh);
    socket.on("ticket:updated",  refresh);
    return () => {
      socket.off("ticket:assigned", refresh);
      socket.off("ticket:updated",  refresh);
    };
  }, [user, fetchTickets]);

  // ── Filter by tab ──────────────────────────────────────────────────
  const filteredTickets = useMemo(
    () => allTickets.filter(t => t.status === activeTab).sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0)),
    [allTickets, activeTab]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of TABS) counts[tab.key] = allTickets.filter(t => t.status === tab.key).length;
    return counts;
  }, [allTickets]);

  // ── Ticket actions ─────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = useCallback(async (id: string, action: "start" | "otp") => {
    setActionLoading(id);
    const endpoint = action === "start"
      ? `/api/public/tickets/${encodeURIComponent(id)}/start`
      : `/api/public/tickets/${encodeURIComponent(id)}/otp`;
    const method = action === "start" ? "PATCH" : "POST";
    try {
      const res = await fetch(endpoint, {
        method,
        headers: action === "otp" ? { "Content-Type": "application/json" } : undefined,
        body: action === "otp" ? JSON.stringify({}) : undefined,
      });
      if (res.ok) await fetchTickets();
    } catch { /* non-fatal */ }
    finally { setActionLoading(null); }
  }, [fetchTickets]);

  const handleRefresh = () => { setTicketsLoading(true); fetchTickets(); };

  // ── Today's date ───────────────────────────────────────────────────
  const formattedDate = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }, []);

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading || ticketsLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  // ── Active job count ───────────────────────────────────────────────
  const totalActive = allTickets.filter(t => t.status !== "CLOSED").length;

  // ── Render ticket card ─────────────────────────────────────────────
  const renderCard = (ticket: ServiceTicket, index: number = 0) => {
    const parsed = parseDescription(ticket.problemDescription);
    const parsedIssue = parseDescription(ticket.issueDescription ?? "");
    const statusCfg = STATUS_CONFIG[ticket.status];
    const issueText = ticket.problemDescription || null;
    const customerName = ticket.machineCustomer || parsedIssue.customerName || parsed.customerName
      || (ticket.customer ? `${ticket.customer.firstName} ${ticket.customer.lastName ?? ""}`.trim() : null);
    const locationShort = [
      [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
      ticket.pincode?.code,
    ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsed.location;
    const isBusy = actionLoading === ticket.id;

    return (
      <div
        key={ticket.id}
        className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
        style={{ transitionDelay: `${250 + index * 70}ms` }}
      >
      <div
        className={cn(
          "bg-white rounded-2xl border border-gray-100 shadow-sm",
          "hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]",
          "transition-all duration-200 p-4 flex flex-col space-y-2",
          getAccentBorder(ticket.ageHours)
        )}>

        {/* TOP: Ticket number + Issue title + Status pill */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            {ticket.ticketNumber && (
              <span className="text-[10px] font-mono text-gray-400 mb-0.5">#{ticket.ticketNumber}</span>
            )}
            <h3 className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">
              {issueText || ticket.problemDescription.slice(0, 60)}
            </h3>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0",
            statusCfg.badgeBg, statusCfg.badgeText
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
            {statusCfg.label}
          </span>
        </div>

        {/* MIDDLE: Location, Customer, Product, S/N, Time, Assigned by */}
        <div className="space-y-1">
          {ticket.customerAddress && (
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
              <Home className="w-3.5 h-3.5 shrink-0 text-blue-500 mt-0.5" />
              <span className="text-xs font-semibold text-blue-700 leading-snug">{ticket.customerAddress}</span>
            </div>
          )}
          {locationShort && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="truncate">{locationShort}</span>
            </div>
          )}
          {customerName && (
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="text-sm text-gray-700 font-medium truncate">{customerName}</span>
            </div>
          )}
          {ticket.machineName && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Briefcase className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="truncate">{ticket.machineName}</span>
            </div>
          )}
          {ticket.machineSerialNumber && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="text-[11px] font-semibold text-gray-400 shrink-0">S/N</span>
              <span className="truncate font-mono">{ticket.machineSerialNumber}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-gray-400 pt-0.5">
            <Clock className="w-3 h-3" />
            <span>Assigned {formatRelativeTime(new Date(ticket.updatedAt))}</span>
          </div>
          {ticket.assignedManager && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate">
                By {ticket.assignedManager.firstName} {ticket.assignedManager.lastName ?? ""}
              </span>
            </div>
          )}
        </div>

        {/* BOTTOM: Primary action */}
        {ticket.status === "ASSIGNED" && (
          <button
            onClick={() => { handleAction(ticket.id, "start"); router.push(`/service/${ticket.id}`); }}
            disabled={isBusy}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Start Work
          </button>
        )}
        {ticket.status === "IN_PROGRESS" && (
          <button
            onClick={() => router.push(`/service/${ticket.id}`)}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <ArrowRight className="w-4 h-4" />
            Continue Work
          </button>
        )}
        {ticket.status === "PENDING_OTP" && (
          <button
            onClick={() => router.push(`/service/${ticket.id}`)}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <KeyRound className="w-4 h-4" />
            Verify OTP
          </button>
        )}
        {ticket.status === "CLOSED" && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600">Completed</span>
          </div>
        )}
      </div>
      </div>
    );
  };

  return (
    <div className="flex h-[100dvh] bg-slate-50 overflow-hidden">

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <aside className={cn(
        "flex flex-col transition-all duration-300 ease-in-out shrink-0 overflow-hidden relative",
        "bg-gradient-to-b from-emerald-950 via-green-900 to-teal-950 shadow-2xl",
        !isMobile && (sidebarOpen ? "w-64" : "w-0"),
        isMobile ? cn("fixed inset-y-0 left-0 z-40 w-64", !sidebarOpen && "-translate-x-full") : ""
      )}>
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-teal-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full min-w-[256px]">
          <SidebarBrand title="Field Engineer" onClose={() => setSidebarOpen(false)} />

          {/* Stats strip */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <p className="text-xl font-bold text-white">{totalActive}</p>
                <p className="text-[10px] text-white/60 font-medium">Active</p>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
                <p className="text-xl font-bold text-emerald-300">{allTickets.length}</p>
                <p className="text-[10px] text-white/60 font-medium">Total</p>
              </div>
            </div>
          </div>

          {/* Nav (tabs as nav items) */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {([
              { key: "ASSIGNED" as TicketStatus, label: "New Jobs", icon: <Briefcase className="w-4 h-4" /> },
              { key: "IN_PROGRESS" as TicketStatus, label: "In Progress", icon: <ArrowRight className="w-4 h-4" /> },
              { key: "PENDING_OTP" as TicketStatus, label: "Pending OTP", icon: <KeyRound className="w-4 h-4" /> },
              { key: "CLOSED" as TicketStatus, label: "Completed", icon: <CheckCircle2 className="w-4 h-4" /> },
            ]).map((item) => {
              const count = tabCounts[item.key] ?? 0;
              const isActive = activeTab === item.key;
              return (
                <button key={item.key} onClick={() => { setActiveTab(item.key); if (isMobile) setSidebarOpen(false); }}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isActive ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10" : "text-white/60 hover:text-white hover:bg-white/8"
                  )}>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-full" />}
                  <span className={cn(isActive ? "text-emerald-300" : "text-white/50 group-hover:text-white/70")}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {count > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user.firstName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-white/50 truncate">{user.email}</p>
              </div>
            </div>
            <button onClick={async () => { await logout(); router.replace("/login"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* ═══════════════════ HEADER ═══════════════════ */}
        <header className="shrink-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(s => !s)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className={`flex-1 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}>
            <h1 className="text-base font-bold text-gray-900 tracking-tight leading-tight">
              {getGreeting()}, {user.firstName}! 👋
            </h1>
            <span className="text-xs text-gray-400">Today, {formattedDate}</span>
          </div>
          <button onClick={handleRefresh} disabled={ticketsLoading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className={cn("w-4 h-4", ticketsLoading && "animate-spin")} />
          </button>
        </header>

        {/* ═══════════════════ TABS (segmented control) ═══════════════════ */}
        <div className={`shrink-0 bg-white border-b border-gray-100 px-4 py-2 transition-all duration-700 delay-150 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-full">
            {TABS.map(tab => {
              const count = tabCounts[tab.key] ?? 0;
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-full transition-all text-center leading-tight",
                    isActive
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  )}>
                  {tab.label}
                  {count > 0 && (
                    <span className={cn(
                      "ml-1 text-[10px]",
                      isActive ? "text-gray-500" : "text-gray-300"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════ TICKET LIST ═══════════════════ */}
        <main className="flex-1 overflow-y-auto pb-4">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Ticket className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm font-medium text-gray-400">
                  No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} jobs
                </p>
                <p className="text-xs mt-0.5">Pull down to refresh</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTickets.map((ticket, i) => renderCard(ticket, i))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
