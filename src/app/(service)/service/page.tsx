"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { LoadingScreen } from "@/components/ui/Loading";
import { Logo } from "@/components/ui/Logo";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LogOut,
  RefreshCw,
  Ticket,
  Play,
  KeyRound,
  CheckCircle2,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";
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
}

const TABS: { key: TicketStatus; label: string; color: string }[] = [
  { key: "ASSIGNED",    label: "Assigned",  color: "text-blue-600" },
  { key: "IN_PROGRESS", label: "Active",    color: "text-amber-600" },
  { key: "PENDING_OTP", label: "OTP",       color: "text-purple-600" },
  { key: "CLOSED",      label: "Closed",    color: "text-emerald-600" },
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

// ── Age badge helper ───────────────────────────────────────────────────
function getAgeBadge(ageHours: number) {
  if (ageHours > 24) return { color: "bg-red-100 text-red-700", label: `${ageHours}h` };
  if (ageHours >= 6) return { color: "bg-amber-100 text-amber-700", label: `${ageHours}h` };
  return { color: "bg-gray-100 text-gray-600", label: `${ageHours}h` };
}

// ── OTP Modal ──────────────────────────────────────────────────────────
function OtpModal({
  ticketId,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (otp.length !== 4) { setError("OTP must be 4 digits"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Verification failed"); return; }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Verify OTP</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-500">Enter the 4-digit code from the customer.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            className="w-full text-center text-3xl font-mono tracking-[0.3em] rounded-xl px-4 py-4 border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 h-11 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading || otp.length !== 4}
            className="flex-1 h-11 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Verify &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TicketStatus>("ASSIGNED");
  const [allTickets, setAllTickets] = useState<ServiceTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [otpModalTicketId, setOtpModalTicketId] = useState<string | null>(null);

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
      ? `/api/tickets/${encodeURIComponent(id)}/start`
      : `/api/tickets/${encodeURIComponent(id)}/otp`;
    const method = action === "start" ? "PATCH" : "POST";
    try {
      const res = await fetch(endpoint, { method, credentials: "include" });
      if (res.ok) await fetchTickets();
    } catch { /* non-fatal */ }
    finally { setActionLoading(null); }
  }, [fetchTickets]);

  const handleOtpSuccess = useCallback(() => {
    setOtpModalTicketId(null);
    fetchTickets();
  }, [fetchTickets]);

  const handleRefresh = () => { setTicketsLoading(true); fetchTickets(); };

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading || ticketsLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  // ── Render ticket card ─────────────────────────────────────────────
  const renderCard = (ticket: ServiceTicket) => {
    const parsed = parseDescription(ticket.problemDescription);
    const issueText = ticket.issueDescription || (parsed.isStructured ? null : ticket.problemDescription);
    const customerName = ticket.machineCustomer || parsed.customerName
      || (ticket.customer ? `${ticket.customer.firstName} ${ticket.customer.lastName ?? ""}`.trim() : null);
    const locationShort = [
      [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
      ticket.pincode?.code,
    ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsed.location;
    const machineDisplay = [ticket.machineName, ticket.machineSerialNumber ? `S/N: ${ticket.machineSerialNumber}` : null].filter(Boolean).join(" · ");
    const ageBadge = typeof ticket.ageHours === "number" ? getAgeBadge(ticket.ageHours) : null;
    const isBusy = actionLoading === ticket.id;

    const borderColor = (ticket.ageHours ?? 0) > 24
      ? "border-l-red-500"
      : (ticket.ageHours ?? 0) >= 6
        ? "border-l-amber-400"
        : "border-l-blue-400";

    return (
      <div key={ticket.id}
        className={cn(
          "bg-white rounded-xl border border-gray-200 border-l-[3px] p-4 flex flex-col gap-2.5 shadow-sm hover:shadow-md transition-shadow",
          borderColor
        )}>
        {/* Row 1: Issue + Status + Age */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 flex-1 min-w-0">
            {issueText || "Service Request"}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {ageBadge && (
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-semibold leading-none", ageBadge.color)}>
                ⏱ {ageBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Location */}
        {locationShort && (
          <p className="text-xs text-gray-500 leading-tight truncate">
            📍 {locationShort}
          </p>
        )}

        {/* Row 3: Customer + Machine */}
        <div className="space-y-0.5">
          {customerName && (
            <p className="text-xs text-gray-600 truncate">{customerName}</p>
          )}
          {machineDisplay && (
            <p className="text-xs text-gray-400 truncate">🛠 {machineDisplay}</p>
          )}
        </div>

        {/* Row 4: Ticket # + time */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 pt-0.5">
          <span className="font-mono">
            {ticket.ticketNumber ? `#${ticket.ticketNumber}` : `#${ticket.id.slice(0, 8).toUpperCase()}`}
          </span>
          <span>{formatRelativeTime(new Date(ticket.createdAt))}</span>
        </div>

        {/* Row 5: Action Button — full width, prominent */}
        {ticket.status === "ASSIGNED" && (
          <button onClick={() => handleAction(ticket.id, "start")} disabled={isBusy}
            className="w-full h-10 mt-1 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm">
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Start Work
          </button>
        )}
        {ticket.status === "IN_PROGRESS" && (
          <button onClick={() => handleAction(ticket.id, "otp")} disabled={isBusy}
            className="w-full h-10 mt-1 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm">
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Continue → Request OTP
          </button>
        )}
        {ticket.status === "PENDING_OTP" && (
          <button onClick={() => setOtpModalTicketId(ticket.id)}
            className="w-full h-10 mt-1 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-sm animate-pulse">
            <KeyRound className="w-4 h-4" />
            Verify OTP
          </button>
        )}
        {ticket.status === "CLOSED" && (
          <div className="flex items-center gap-1.5 mt-1 px-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Completed</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden">

      {/* OTP Modal */}
      {otpModalTicketId && (
        <OtpModal
          ticketId={otpModalTicketId}
          onClose={() => setOtpModalTicketId(null)}
          onSuccess={handleOtpSuccess}
        />
      )}

      {/* ═══════════════════ HEADER ═══════════════════ */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo className="h-7 w-auto" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">My Tasks</h1>
            <p className="text-[11px] text-gray-500">{user.firstName} {user.lastName ?? ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleRefresh} disabled={ticketsLoading}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className={cn("w-4 h-4", ticketsLoading && "animate-spin")} />
          </button>
          <button onClick={async () => { await logout(); router.replace("/login"); }}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ═══════════════════ TAB BAR ═══════════════════ */}
      <div className="shrink-0 grid grid-cols-4 bg-white border-b border-gray-200">
        {TABS.map(tab => {
          const count = tabCounts[tab.key] ?? 0;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "py-2.5 flex flex-col items-center gap-0.5 text-xs border-b-2 transition-all",
                isActive
                  ? "border-blue-600 bg-blue-50/50"
                  : "border-transparent hover:bg-gray-50"
              )}>
              <span className={cn("text-lg font-bold leading-none", isActive ? tab.color : "text-gray-400")}>
                {count}
              </span>
              <span className={cn("font-semibold", isActive ? "text-gray-900" : "text-gray-400")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════ TICKET LIST ═══════════════════ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Ticket className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} tickets</p>
              <p className="text-xs mt-1 text-gray-300">Pull down to refresh</p>
            </div>
          ) : (
            filteredTickets.map(renderCard)
          )}
        </div>
      </main>
    </div>
  );
}
