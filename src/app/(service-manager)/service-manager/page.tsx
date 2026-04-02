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
type TabKey = "unassigned" | "assigned" | "in_progress" | "closed";

interface Engineer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  activeTickets?: number;
}

interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  status: TicketStatus;
  problemDescription: string;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  machineProductCode?: string | null;
  machineCustomer?: string | null;
  ageHours?: number;
  responseTimeHours?: number | null;
  durationHours?: number | null;
  createdAt: string;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  assignedManager?: { firstName: string; lastName?: string | null } | null;
  dealer?: { firstName: string; lastName?: string | null } | null;
  pincode?: { code: string; regionName: string } | null;
}

// ── Tab config ─────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string; statuses: TicketStatus[]; icon: React.ReactNode }[] = [
  { key: "unassigned", label: "Unassigned", statuses: ["OPEN"], icon: <AlertCircle className="w-3.5 h-3.5" /> },
  { key: "assigned", label: "Assigned", statuses: ["ASSIGNED"], icon: <UserCheck className="w-3.5 h-3.5" /> },
  { key: "in_progress", label: "In Progress", statuses: ["IN_PROGRESS", "PENDING_OTP"], icon: <Activity className="w-3.5 h-3.5" /> },
  { key: "closed", label: "Closed", statuses: ["CLOSED"], icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
];

function getAgeBadge(ageHours: number): { color: string; label: string } {
  if (ageHours <= 12) return { color: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400", label: `${ageHours}h` };
  if (ageHours <= 24) return { color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400", label: `${ageHours}h` };
  return { color: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400", label: `${ageHours}h` };
}

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error" }> = {
  OPEN:        { label: "Open",        variant: "error" },
  ASSIGNED:    { label: "Assigned",    variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PENDING_OTP: { label: "Pending OTP", variant: "default" },
  CLOSED:      { label: "Closed",      variant: "success" },
};

export default function ServiceManagerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("unassigned");
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
  const total = tickets.length;
  const unassigned = tickets.filter(t => t.status === "OPEN").length;
  const assigned = tickets.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status)).length;
  const closed = tickets.filter(t => t.status === "CLOSED").length;

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const displayed = tickets.filter(t => currentTab.statuses.includes(t.status));

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

        {/* ── Summary Bar ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: total, color: "text-content dark:text-content-dark" },
            { label: "Unassigned", value: unassigned, color: "text-red-500" },
            { label: "Active", value: assigned, color: "text-blue-500" },
            { label: "Closed", value: closed, color: "text-green-500" },
          ].map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card"
            >
              <p className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">{item.label}</p>
              <p className={cn("text-2xl font-bold", item.color)}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Team overview */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <Users className="w-5 h-5 text-primary dark:text-primary-300 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-content dark:text-content-dark">
              {engineers.length} engineer{engineers.length !== 1 ? "s" : ""} in your zone
            </p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
              {engineers.map((e) => {
                const name = `${e.firstName} ${e.lastName || ""}`.trim();
                return e.activeTickets !== undefined ? `${name} (${e.activeTickets})` : name;
              }).join(", ") || "No engineers assigned yet"}
            </p>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary">
          {TABS.map((tab) => {
            const count = tickets.filter(t => tab.statuses.includes(t.status)).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                    : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                {tab.icon}
                {tab.label}
                <span className={cn(
                  "ml-1 text-xs px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-primary/10 text-primary" : "bg-surface-card/50 dark:bg-surface-dark-card/50"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Ticket List ────────────────────────────────────────── */}
        <section className="space-y-3">
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-secondary dark:text-content-dark-secondary">
              <Ticket className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No {currentTab.label.toLowerCase()} tickets</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((ticket) => {
                const cfg = STATUS_BADGE[ticket.status];
                const canAssign = ticket.status === "OPEN" || ticket.status === "ASSIGNED";
                const ageBadge = typeof ticket.ageHours === "number" ? getAgeBadge(ticket.ageHours) : null;
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
                          {ageBadge && (
                            <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", ageBadge.color)}>
                              {ageBadge.label}
                            </span>
                          )}
                          {ticket.pincode && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                              📍 {ticket.pincode.code} — {ticket.pincode.regionName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-content dark:text-content-dark font-medium line-clamp-2 mb-1">
                          {ticket.problemDescription}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-content-secondary dark:text-content-dark-secondary">
                          {ticket.machineName && <span>Machine: {ticket.machineName}</span>}
                          {ticket.machineProductCode && <span>Product: {ticket.machineProductCode}</span>}
                          {ticket.machineSerialNumber && <span>S/N: {ticket.machineSerialNumber}</span>}
                          {ticket.machineCustomer && <span>Mfr. Customer: {ticket.machineCustomer}</span>}
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
                            <div className="absolute right-0 top-full mt-1 w-56 z-20 rounded-xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-lg overflow-hidden">
                              {engineers.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-content-secondary dark:text-content-dark-secondary">
                                  No engineers in your zone
                                </p>
                              ) : (
                                engineers.map((eng) => (
                                  <button
                                    key={eng.id}
                                    onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-between"
                                  >
                                    <span>{eng.firstName} {eng.lastName}</span>
                                    {eng.activeTickets !== undefined && (
                                      <span className={cn(
                                        "text-xs px-1.5 py-0.5 rounded-full",
                                        eng.activeTickets === 0
                                          ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                                          : eng.activeTickets <= 3
                                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600"
                                            : "bg-red-100 dark:bg-red-900/30 text-red-600"
                                      )}>
                                        {eng.activeTickets} active
                                      </span>
                                    )}
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
