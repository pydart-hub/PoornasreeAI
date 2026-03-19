"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingScreen } from "@/components/ui/Loading";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LogOut,
  RefreshCw,
  Ticket,
  Play,
  KeyRound,
  CheckCircle2,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

// ── Types ──────────────────────────────────────────────────────────────
type TicketStatus = "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  status: TicketStatus;
  problemDescription: string;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  ageHours?: number;
  createdAt: string;
  updatedAt: string;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
}

const TABS: { label: string; status: TicketStatus }[] = [
  { label: "Assigned",    status: "ASSIGNED" },
  { label: "In Progress", status: "IN_PROGRESS" },
  { label: "Pending OTP", status: "PENDING_OTP" },
  { label: "Closed",      status: "CLOSED" },
];

// ── Status badge ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TicketStatus }) {
  const variantMap: Record<TicketStatus, "info" | "warning" | "default" | "success"> = {
    ASSIGNED:    "info",
    IN_PROGRESS: "warning",
    PENDING_OTP: "default",
    CLOSED:      "success",
  };
  const labelMap: Record<TicketStatus, string> = {
    ASSIGNED:    "Assigned",
    IN_PROGRESS: "In Progress",
    PENDING_OTP: "Pending OTP",
    CLOSED:      "Closed",
  };
  return <Badge variant={variantMap[status]}>{labelMap[status]}</Badge>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-content dark:text-content-dark">Verify OTP</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <X className="w-4 h-4 text-content-secondary" />
          </button>
        </div>
        <p className="text-sm text-content-secondary dark:text-content-dark-secondary mb-4">
          Enter the 4-digit OTP provided by the customer to close this ticket.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0000"
          className="w-full text-center text-2xl font-mono tracking-widest rounded-xl px-4 py-3 border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" size="md" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} loading={loading} className="flex-1">
            Verify &amp; Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Ticket Card ────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  onAction,
  onVerifyOtp,
}: {
  ticket: ServiceTicket;
  onAction: (id: string, action: "start" | "otp") => Promise<void>;
  onVerifyOtp: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleAction = async (action: "start" | "otp") => {
    setBusy(true);
    await onAction(ticket.id, action);
    setBusy(false);
  };

  return (
    <div className="bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-content dark:text-content-dark truncate">
            {ticket.machineName || "Machine Support"}
          </p>
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
            {ticket.ticketNumber ? `#${ticket.ticketNumber}` : `#${ticket.id.slice(0, 8).toUpperCase()}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {typeof ticket.ageHours === "number" && (
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full font-medium",
              ticket.ageHours > 24
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : ticket.ageHours > 8
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
            )}>
              {ticket.ageHours}h
            </span>
          )}
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-content-secondary dark:text-content-dark-secondary line-clamp-2">
        {ticket.problemDescription}
      </p>

      {/* Customer & time */}
      <div className="flex items-center justify-between text-xs text-content-tertiary dark:text-content-dark-secondary">
        <span>
          {ticket.customer
            ? `${ticket.customer.firstName} ${ticket.customer.lastName ?? ""}`.trim()
            : "—"}
        </span>
        <span>{formatRelativeTime(new Date(ticket.updatedAt))}</span>
      </div>

      {/* Action button — strictly controlled by status */}
      {ticket.status === "ASSIGNED" && (
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          icon={!busy ? <Play className="w-3.5 h-3.5" /> : undefined}
          onClick={() => handleAction("start")}
        >
          Start Work
        </Button>
      )}
      {ticket.status === "IN_PROGRESS" && (
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          icon={!busy ? <KeyRound className="w-3.5 h-3.5" /> : undefined}
          onClick={() => handleAction("otp")}
        >
          Request OTP
        </Button>
      )}
      {ticket.status === "PENDING_OTP" && (
        <Button
          variant="primary"
          size="sm"
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          onClick={() => onVerifyOtp(ticket.id)}
        >
          Verify OTP
        </Button>
      )}
      {/* CLOSED: no action buttons — read-only */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function ServiceDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [activeTab, setActiveTab] = useState<TicketStatus>("ASSIGNED");
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [allTickets, setAllTickets] = useState<ServiceTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [otpModalTicketId, setOtpModalTicketId] = useState<string | null>(null);

  // ── Responsive ─────────────────────────────────────────────────────
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

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && !["service", "admin", "service_engineer"].includes(user.role))
      router.replace("/");
  }, [user, authLoading, router]);

  // ── Fetch tickets ──────────────────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const [tabRes, allRes] = await Promise.all([
        fetch(`/api/tickets?status=${activeTab}`, { credentials: "include" }),
        fetch(`/api/tickets`, { credentials: "include" }),
      ]);
      if (tabRes.ok) {
        const data = await tabRes.json();
        setTickets(data.tickets || []);
      }
      if (allRes.ok) {
        const data = await allRes.json();
        setAllTickets(data.tickets || []);
      }
    } catch { /* non-fatal */ }
    finally { setTicketsLoading(false); }
  }, [activeTab]);

  useEffect(() => {
    if (user) fetchTickets();
  }, [user, fetchTickets]);

  // ── Real-time: refresh when a ticket is assigned to this engineer ──
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

  // ── Ticket actions ─────────────────────────────────────────────────
  const handleAction = useCallback(async (id: string, action: "start" | "otp") => {
    const endpoint = action === "start"
      ? `/api/tickets/${encodeURIComponent(id)}/start`
      : `/api/tickets/${encodeURIComponent(id)}/otp`;
    const method = action === "start" ? "PATCH" : "POST";
    try {
      const res = await fetch(endpoint, { method, credentials: "include" });
      if (res.ok) fetchTickets();
    } catch { /* non-fatal */ }
  }, [fetchTickets]);

  const handleOtpSuccess = useCallback(() => {
    setOtpModalTicketId(null);
    fetchTickets();
  }, [fetchTickets]);

  // ── Render guards ──────────────────────────────────────────────────
  if (authLoading) return <LoadingScreen message="Loading..." />;
  if (!user) return null;

  return (
    <div className="h-screen flex overflow-hidden bg-surface dark:bg-surface-dark">

      {/* OTP Modal */}
      {otpModalTicketId && (
        <OtpModal
          ticketId={otpModalTicketId}
          onClose={() => setOtpModalTicketId(null)}
          onSuccess={handleOtpSuccess}
        />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SIDEBAR                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <aside
        className={cn(
          "flex flex-col h-full bg-surface-sidebar dark:bg-surface-dark-sidebar border-r border-line dark:border-line-dark transition-all duration-300 ease-in-out shrink-0",
          isMobile ? "fixed inset-y-0 left-0 z-40 w-[240px]" : "relative",
          !sidebarOpen && (isMobile ? "-translate-x-full" : "w-0 overflow-hidden border-r-0"),
          sidebarOpen && "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark shrink-0">
          <Logo variant="full" size="sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Section label */}
        <div className="px-3 py-4 border-b border-line dark:border-line-dark">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-200 dark:border-blue-500/30">
              <Ticket className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-content dark:text-content-dark">My Tickets</p>
              <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary">Service workflow</p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={cn(
                "w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.status
                  ? "bg-primary/10 dark:bg-primary/20 text-primary"
                  : "text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* User profile */}
        <div className="shrink-0 border-t border-line dark:border-line-dark p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
            <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                {user.firstName} {user.lastName ?? ""}
              </p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">
                {user.email}
              </p>
            </div>
            <button
              onClick={async () => { await logout(); router.replace("/login"); }}
              className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Sidebar backdrop (mobile) */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN                                                       */}
      {/* ══════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="shrink-0 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur border-b border-line dark:border-line-dark px-4 sm:px-5 py-3 flex items-center gap-3 z-10">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
            >
              {isMobile ? <Menu className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-content dark:text-content-dark truncate">
              Service Dashboard
            </h1>
            <p className="text-[11px] text-content-secondary dark:text-content-dark-secondary">
              {user.firstName} · {TABS.find((t) => t.status === activeTab)?.label} tickets
            </p>
          </div>
          <button
            onClick={fetchTickets}
            disabled={ticketsLoading}
            className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", ticketsLoading && "animate-spin")} />
          </button>
          <Badge variant="info" dot>
            {user.role === "admin" ? "Admin" : "Service Engineer"}
          </Badge>
        </header>

        {/* Summary bar */}
        <div className="shrink-0 grid grid-cols-4 gap-0 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
          {TABS.map((tab) => {
            const count = allTickets.filter((t) => t.status === tab.status).length;
            return (
              <button
                key={tab.status}
                onClick={() => setActiveTab(tab.status)}
                className={cn(
                  "py-3 flex flex-col items-center gap-0.5 text-xs border-b-2 transition-colors",
                  activeTab === tab.status
                    ? "border-primary text-primary"
                    : "border-transparent text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                <span className="text-lg font-bold leading-none">{count}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab bar */}
        <div className="shrink-0 flex border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card px-4 gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === tab.status
                  ? "border-primary text-primary"
                  : "border-transparent text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ticket grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {ticketsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark flex items-center justify-center">
                <Ticket className="w-7 h-7 text-content-secondary/40" />
              </div>
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                No {TABS.find((t) => t.status === activeTab)?.label.toLowerCase()} tickets
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onAction={handleAction}
                  onVerifyOtp={(id) => setOtpModalTicketId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
