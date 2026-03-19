"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingScreen } from "@/components/ui/Loading";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LogOut,
  RefreshCw,
  Ticket,
  UserCheck,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Loader2,
  ChevronDown,
  X,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

interface Engineer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
}

interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  status: TicketStatus;
  problemDescription: string;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  ageHours?: number;
  responseTimeHours?: number | null;
  durationHours?: number | null;
  createdAt: string;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  dealer?: { firstName: string; lastName?: string | null } | null;
}

// ── Status config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error"; icon: React.ReactNode }> = {
  OPEN:        { label: "Open",        variant: "error",   icon: <AlertCircle className="w-3.5 h-3.5" /> },
  ASSIGNED:    { label: "Assigned",    variant: "info",    icon: <UserCheck className="w-3.5 h-3.5" /> },
  IN_PROGRESS: { label: "In Progress", variant: "warning", icon: <Activity className="w-3.5 h-3.5" /> },
  PENDING_OTP: { label: "Pending OTP", variant: "default", icon: <Clock className="w-3.5 h-3.5" /> },
  CLOSED:      { label: "Closed",      variant: "success", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const ALL_STATUSES: TicketStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"];

export default function ServiceManagerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "service_manager")) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    try {
      const [ticketsRes, engineersRes] = await Promise.all([
        fetch("/api/tickets", { credentials: "include" }),
        fetch("/api/tickets/engineers", { credentials: "include" }),
      ]);

      if (ticketsRes.ok) {
        const { tickets: data } = await ticketsRes.json();
        setTickets(data ?? []);
      }
      if (engineersRes.ok) {
        const { engineers: data } = await engineersRes.json();
        setEngineers(data ?? []);
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "service_manager") {
      fetchData();
    }
  }, [user, fetchData]);

  // ── Real-time socket listener ──────────────────────────────────────
  useEffect(() => {
    if (!user || user.role !== "service_manager") return;
    const socket = getSocket({
      userId: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName || ""}`.trim(),
    });
    const refresh = () => fetchData();
    socket.on("ticket:new",     refresh);
    socket.on("ticket:updated", refresh);
    return () => {
      socket.off("ticket:new",     refresh);
      socket.off("ticket:updated", refresh);
    };
  }, [user, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAssignEngineer = async (ticketId: string, engineerId: string) => {
    setAssigningId(ticketId);
    setDropdownOpen(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign-engineer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ engineerId }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg || "Failed to assign engineer");
      } else {
        await fetchData();
      }
    } catch {
      setError("Network error");
    } finally {
      setAssigningId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  // ── Summary counts ──
  const counts = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = tickets.filter((t) => t.status === s).length;
    return acc;
  }, {});

  const displayed = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  return (
    <div className="flex flex-col h-screen bg-surface dark:bg-surface-dark overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-auto" />
          <div>
            <p className="text-sm font-semibold text-content dark:text-content-dark">Service Manager</p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
              {user.firstName} {user.lastName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </button>
          <Avatar name={`${user.firstName} ${user.lastName || ""}`} size="sm" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-content-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Summary Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ALL_STATUSES.map((s) => {
            const cfg = STATUS_CONFIG[s];
            const isSelected = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(isSelected ? null : s)}
                className={cn(
                  "p-4 rounded-2xl border text-left transition-all",
                  isSelected
                    ? "bg-primary/10 dark:bg-primary-400/10 border-primary/30 dark:border-primary-400/30"
                    : "bg-surface-card dark:bg-surface-dark-card border-line dark:border-line-dark hover:border-primary/30 dark:hover:border-primary-400/30"
                )}
              >
                <div className="flex items-center gap-1.5 mb-2 text-content-secondary dark:text-content-dark-secondary">
                  {cfg.icon}
                  <span className="text-xs font-medium">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-content dark:text-content-dark">{counts[s] ?? 0}</p>
              </button>
            );
          })}
        </div>

        {/* Team overview */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <Users className="w-5 h-5 text-primary dark:text-primary-300 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-content dark:text-content-dark">
              {engineers.length} engineer{engineers.length !== 1 ? "s" : ""} in your zone
            </p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
              {engineers.map((e) => `${e.firstName} ${e.lastName || ""}`.trim()).join(", ") || "No engineers assigned yet"}
            </p>
          </div>
        </div>

        {/* ── Ticket List ────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content dark:text-content-dark">
              {statusFilter ? `${STATUS_CONFIG[statusFilter].label} Tickets` : "All Tickets"}
              <span className="ml-2 text-xs text-content-secondary dark:text-content-dark-secondary font-normal">
                ({displayed.length})
              </span>
            </h2>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
              >
                <X className="w-3 h-3" /> Clear filter
              </button>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-secondary dark:text-content-dark-secondary">
              <Ticket className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No tickets found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((ticket) => {
                const cfg = STATUS_CONFIG[ticket.status];
                const canAssign = ticket.status === "OPEN" || ticket.status === "ASSIGNED";
                return (
                  <div
                    key={ticket.id}
                    className="p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {ticket.ticketNumber && (
                            <span className="text-xs font-mono text-content-secondary dark:text-content-dark-secondary">
                              #{ticket.ticketNumber}
                            </span>
                          )}
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          {typeof ticket.ageHours === "number" && (
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded-full",
                              ticket.ageHours > 24
                                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                            )}>
                              {ticket.ageHours}h old
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-content dark:text-content-dark font-medium line-clamp-2 mb-1">
                          {ticket.problemDescription}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-content-secondary dark:text-content-dark-secondary">
                          {ticket.machineName && <span>Machine: {ticket.machineName}</span>}
                          {ticket.machineSerialNumber && <span>S/N: {ticket.machineSerialNumber}</span>}
                          {ticket.customer && (
                            <span>Customer: {ticket.customer.firstName} {ticket.customer.lastName}</span>
                          )}
                          {ticket.dealer && (
                            <span>Dealer: {ticket.dealer.firstName} {ticket.dealer.lastName}</span>
                          )}
                          {ticket.assignedEngineer && (
                            <span className="text-primary dark:text-primary-300">
                              Engineer: {ticket.assignedEngineer.firstName} {ticket.assignedEngineer.lastName}
                            </span>
                          )}
                          <span>{formatRelativeTime(new Date(ticket.createdAt))}</span>
                        </div>
                        {/* Metrics row */}
                        {(ticket.responseTimeHours !== null || ticket.durationHours !== null) && (
                          <div className="flex gap-3 mt-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                            {ticket.responseTimeHours !== null && (
                              <span>Response: {ticket.responseTimeHours}h</span>
                            )}
                            {ticket.durationHours !== null && (
                              <span>Duration: {ticket.durationHours}h</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Assign Engineer button */}
                      {canAssign && (
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setDropdownOpen(dropdownOpen === ticket.id ? null : ticket.id)}
                            disabled={assigningId === ticket.id || engineers.length === 0}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                              assigningId === ticket.id
                                ? "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                                : "bg-primary text-white hover:bg-primary-600 disabled:opacity-50"
                            )}
                          >
                            {assigningId === ticket.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                            Assign
                            <ChevronDown className="w-3 h-3" />
                          </button>

                          {dropdownOpen === ticket.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 z-20 rounded-xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-lg overflow-hidden">
                              {engineers.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                                  No engineers in your zone
                                </p>
                              ) : (
                                engineers.map((eng) => (
                                  <button
                                    key={eng.id}
                                    onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                                  >
                                    {eng.firstName} {eng.lastName}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Close dropdown on outside click */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setDropdownOpen(null)}
        />
      )}
    </div>
  );
}
