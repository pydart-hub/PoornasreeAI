"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/Loading";
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
  MapPin,
  Clock,
  Briefcase,
  Home,
  User,
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

const STATUS_CONFIG: Record<TicketStatus, { dot: string; label: string; bg: string; border: string; text: string }> = {
  ASSIGNED:    { dot: "bg-blue-500",    label: "New",        bg: "",                border: "border-l-blue-500",    text: "text-blue-600" },
  IN_PROGRESS: { dot: "bg-amber-500",   label: "On going",   bg: "bg-orange-50/50", border: "border-l-amber-500",   text: "text-amber-600" },
  PENDING_OTP: { dot: "bg-purple-500",  label: "Verify OTP", bg: "bg-purple-50/50", border: "border-l-purple-500",  text: "text-purple-600" },
  CLOSED:      { dot: "bg-emerald-500", label: "Done",       bg: "",                border: "border-l-emerald-500", text: "text-emerald-600" },
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
  const renderCard = (ticket: ServiceTicket) => {
    const parsed = parseDescription(ticket.problemDescription);
    const statusCfg = STATUS_CONFIG[ticket.status];
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

    return (
      <div key={ticket.id}
        className={cn(
          "bg-white rounded-xl border border-gray-200 border-l-[3px] p-3 flex flex-col gap-1.5 transition-shadow hover:shadow-md",
          statusCfg.border,
          statusCfg.bg
        )}>
        {/* Row 1: Issue title + Status badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1 min-w-0">
            {issueText || ticket.problemDescription.slice(0, 60)}
          </h3>
          <span className="flex items-center gap-1 text-[11px] font-medium shrink-0 mt-px">
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
            <span className={statusCfg.text}>{statusCfg.label}</span>
          </span>
        </div>

        {/* Row 2: Location + Time */}
        <div className="flex items-center justify-between gap-2">
          {locationShort ? (
            <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
              <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
              <span className="truncate">{locationShort}</span>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(new Date(ticket.createdAt))}</span>
            {ageBadge && (
              <span className={cn("px-1 py-px rounded text-[9px] font-bold leading-none ml-0.5", ageBadge.color)}>
                {ageBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Customer */}
        {customerName && (
          <p className="text-xs text-gray-600 leading-tight truncate">{customerName}</p>
        )}

        {/* Row 4: Machine */}
        {machineDisplay && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="shrink-0">🛠</span>
            <span className="truncate">{machineDisplay}</span>
          </div>
        )}

        {/* Action Button */}
        {ticket.status === "ASSIGNED" && (
          <button onClick={() => handleAction(ticket.id, "start")} disabled={isBusy}
            className="w-full h-9 mt-0.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start Work
          </button>
        )}
        {ticket.status === "IN_PROGRESS" && (
          <button onClick={() => handleAction(ticket.id, "otp")} disabled={isBusy}
            className="w-full h-9 mt-0.5 rounded-lg text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Request OTP
          </button>
        )}
        {ticket.status === "PENDING_OTP" && (
          <button onClick={() => setOtpModalTicketId(ticket.id)}
            className="w-full h-9 mt-0.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-all flex items-center justify-center gap-1.5 animate-pulse">
            <KeyRound className="w-3.5 h-3.5" />
            Verify OTP
          </button>
        )}
        {ticket.status === "CLOSED" && (
          <div className="flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Completed</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* OTP Modal */}
      {otpModalTicketId && (
        <OtpModal
          ticketId={otpModalTicketId}
          onClose={() => setOtpModalTicketId(null)}
          onSuccess={handleOtpSuccess}
        />
      )}

      {/* ═══════════════════ HEADER ═══════════════════ */}
      <header className="shrink-0 bg-white px-4 pt-4 pb-2 border-b border-gray-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Jobs</h1>
            <span className="text-xs text-gray-400">Today, {formattedDate}</span>
          </div>
          <button onClick={handleRefresh} disabled={ticketsLoading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className={cn("w-4 h-4", ticketsLoading && "animate-spin")} />
          </button>
        </div>
      </header>

      {/* ═══════════════════ TABS (segmented control) ═══════════════════ */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {TABS.map(tab => {
              const count = tabCounts[tab.key] ?? 0;
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all text-center leading-tight",
                    isActive
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-500"
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
      </div>

      {/* ═══════════════════ TICKET LIST ═══════════════════ */}
      <main className="flex-1 overflow-y-auto pb-20">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredTickets.map(renderCard)}
            </div>
          )}
        </div>
      </main>

      {/* ═══════════════════ BOTTOM NAV ═══════════════════ */}
      <nav className="shrink-0 fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-around py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          <button onClick={() => router.push("/")}
            className="flex flex-col items-center gap-px px-2 py-0.5 text-gray-400 hover:text-gray-600 transition-colors">
            <Home className="w-4 h-4" />
            <span className="text-[9px] font-medium">Home</span>
          </button>

          <button className="flex flex-col items-center gap-px px-2 py-0.5 text-blue-600 relative">
            <span className="absolute -top-1.5 w-4 h-0.5 rounded-full bg-blue-600" />
            <Briefcase className="w-4 h-4" />
            <span className="text-[9px] font-bold">Jobs</span>
            {totalActive > 0 && (
              <span className="absolute -top-1 right-0 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                {totalActive > 9 ? "9+" : totalActive}
              </span>
            )}
          </button>

          {/* Center floating refresh */}
          <div className="relative -mt-5">
            <button onClick={handleRefresh} disabled={ticketsLoading}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-md shadow-purple-400/30 flex items-center justify-center hover:shadow-lg transition-all active:scale-95">
              <RefreshCw className={cn("w-5 h-5", ticketsLoading && "animate-spin")} />
            </button>
          </div>

          <button className="flex flex-col items-center gap-px px-2 py-0.5 text-gray-400">
            <User className="w-4 h-4" />
            <span className="text-[9px] font-medium truncate max-w-[40px]">{user.firstName}</span>
          </button>

          <button onClick={async () => { await logout(); router.replace("/login"); }}
            className="flex flex-col items-center gap-px px-2 py-0.5 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
            <span className="text-[9px] font-medium">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
