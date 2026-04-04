"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  ChevronUp,
  X,
  Search,
  Archive,
  RotateCcw,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type TabKey = "unassigned" | "assigned" | "in_progress" | "closed" | "archived";
type DateRange = "all" | "today" | "7days" | "30days";

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
  { key: "archived", label: "Archived", statuses: [], icon: <Archive className="w-3.5 h-3.5" /> },
];

// ── Urgency helpers ────────────────────────────────────────────────────
function getAgeBadge(ageHours: number): { color: string; label: string; urgency: string } {
  if (ageHours > 24) return { color: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400", label: `${ageHours}h`, urgency: "Critical" };
  if (ageHours >= 6) return { color: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400", label: `${ageHours}h`, urgency: "Urgent" };
  return { color: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400", label: `${ageHours}h`, urgency: "" };
}

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error" }> = {
  OPEN:        { label: "Open",        variant: "error" },
  ASSIGNED:    { label: "Assigned",    variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PENDING_OTP: { label: "Pending OTP", variant: "default" },
  CLOSED:      { label: "Closed",      variant: "success" },
};

// ── Date range filter helper ───────────────────────────────────────────
function isWithinDateRange(createdAt: string, range: DateRange): boolean {
  if (range === "all") return true;
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (range === "today") return diffDays <= 1;
  if (range === "7days") return diffDays <= 7;
  if (range === "30days") return diffDays <= 30;
  return true;
}

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Filter state ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("sm_archived_tickets");
        return stored ? new Set(JSON.parse(stored)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });

  // Persist archived ids
  useEffect(() => {
    localStorage.setItem("sm_archived_tickets", JSON.stringify(Array.from(archivedIds)));
  }, [archivedIds]);

  const handleArchive = (ticketId: string) => {
    setArchivedIds(prev => new Set(prev).add(ticketId));
  };

  const handleUnarchive = (ticketId: string) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDateRange("all");
  };

  const hasActiveFilters = searchQuery !== "" || dateRange !== "all";

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

  // ── Filtered + sorted tickets ──────────────────────────────────────
  const sortedEngineers = useMemo(
    () => [...engineers].sort((a, b) => (a.activeTickets ?? 0) - (b.activeTickets ?? 0)),
    [engineers]
  );

  const displayed = useMemo(() => {
    const currentTab = TABS.find(t => t.key === activeTab)!;
    let result: ServiceTicket[];

    if (activeTab === "archived") {
      result = tickets.filter(t => archivedIds.has(t.id));
    } else {
      result = tickets.filter(t => currentTab.statuses.includes(t.status) && !archivedIds.has(t.id));
    }

    // Date filter
    if (dateRange !== "all") {
      result = result.filter(t => isWithinDateRange(t.createdAt, dateRange));
    }

    // Search filter (ticket number or customer email/phone-as-email)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t => {
        const ticketNo = (t.ticketNumber ?? "").toLowerCase();
        const custEmail = (t.customer?.email ?? "").toLowerCase();
        const custName = `${t.customer?.firstName ?? ""} ${t.customer?.lastName ?? ""}`.toLowerCase();
        return ticketNo.includes(q) || custEmail.includes(q) || custName.includes(q);
      });
    }

    // Sort by age descending (most urgent first)
    return result.sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0));
  }, [tickets, activeTab, archivedIds, dateRange, searchQuery]);

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  // ── Summary counts (non-archived only) ──
  const nonArchived = tickets.filter(t => !archivedIds.has(t.id));
  const total = nonArchived.length;
  const unassigned = nonArchived.filter(t => t.status === "OPEN").length;
  const active = nonArchived.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status)).length;
  const closed = nonArchived.filter(t => t.status === "CLOSED").length;

  return (
    <div className="flex flex-col h-screen bg-surface dark:bg-surface-dark overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-auto" />
          <div>
            <p className="text-sm font-semibold text-content dark:text-content-dark">Service Manager</p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
              {user.firstName} {user.lastName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Summary Bar ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Total", value: total, color: "text-content dark:text-content-dark" },
            { label: "Unassigned", value: unassigned, color: "text-red-500" },
            { label: "Active", value: active, color: "text-blue-500" },
            { label: "Closed", value: closed, color: "text-green-500" },
          ].map((item) => (
            <div
              key={item.label}
              className="p-3 rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card"
            >
              <p className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">{item.label}</p>
              <p className={cn("text-xl font-bold", item.color)}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Team overview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          <Users className="w-5 h-5 text-primary dark:text-primary-300 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content dark:text-content-dark">
              {engineers.length} engineer{engineers.length !== 1 ? "s" : ""} in your zone
            </p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">
              {engineers.map((e) => {
                const name = `${e.firstName} ${e.lastName || ""}`.trim();
                return e.activeTickets !== undefined ? `${name} (${e.activeTickets})` : name;
              }).join(", ") || "No engineers assigned yet"}
            </p>
          </div>
        </div>

        {/* ── Filter Bar ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
          {/* Date range */}
          <div className="flex gap-1">
            {([
              { key: "all", label: "All Time" },
              { key: "today", label: "Today" },
              { key: "7days", label: "7 Days" },
              { key: "30days", label: "30 Days" },
            ] as { key: DateRange; label: string }[]).map((d) => (
              <button
                key={d.key}
                onClick={() => setDateRange(d.key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  dateRange === d.key
                    ? "bg-primary text-white"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary dark:text-content-dark-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket # or customer..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content dark:text-content-dark placeholder:text-content-secondary/50 dark:placeholder:text-content-dark-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        {/* ── Tabs ────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary overflow-x-auto">
          {TABS.map((tab) => {
            let count: number;
            if (tab.key === "archived") {
              count = tickets.filter(t => archivedIds.has(t.id)).length;
            } else {
              count = tickets.filter(t => tab.statuses.includes(t.status) && !archivedIds.has(t.id)).length;
            }
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-surface-card dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                    : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className={cn(
                  "ml-0.5 text-xs px-1.5 py-0.5 rounded-full",
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
              <p className="text-sm">
                {hasActiveFilters ? "No tickets match your filters" : `No ${(TABS.find(t => t.key === activeTab)?.label ?? "").toLowerCase()} tickets`}
              </p>
              {hasActiveFilters && (
                <button onClick={resetFilters} className="mt-2 text-xs text-primary hover:underline">Clear filters</button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((ticket) => {
                const cfg = STATUS_BADGE[ticket.status];
                const canAssign = ticket.status === "OPEN" || ticket.status === "ASSIGNED";
                const ageBadge = typeof ticket.ageHours === "number" ? getAgeBadge(ticket.ageHours) : null;
                const isExpanded = expandedId === ticket.id;
                const isArchived = archivedIds.has(ticket.id);
                return (
                  <div
                    key={ticket.id}
                    className={cn(
                      "rounded-2xl bg-surface-card dark:bg-surface-dark-card border overflow-hidden",
                      ticket.status === "OPEN" && !isArchived
                        ? "border-red-300 dark:border-red-700"
                        : "border-line dark:border-line-dark"
                    )}
                  >
                    {/* ── Card Header: Needs Assignment banner ── */}
                    {ticket.status === "OPEN" && !isArchived && (
                      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-red-50 dark:bg-red-900/20 text-xs font-semibold text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        ⚠ Needs Assignment
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* ── 1. Header: Ticket # / Status / Age ── */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {ticket.ticketNumber && (
                          <span className="text-sm font-mono font-bold text-content dark:text-content-dark">
                            #{ticket.ticketNumber}
                          </span>
                        )}
                        <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                        {ageBadge && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", ageBadge.color)}>
                            {ageBadge.label}{ageBadge.urgency ? ` · ${ageBadge.urgency}` : ""}
                          </span>
                        )}
                        {ticket.assignedEngineer && (
                          <span className="ml-auto text-xs text-primary dark:text-primary-300 font-medium">
                            👷 {ticket.assignedEngineer.firstName} {ticket.assignedEngineer.lastName}
                          </span>
                        )}
                      </div>

                      {/* ── 2. Customer & Location ── */}
                      <div className="space-y-0.5">
                        {ticket.customer && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="text-sm font-medium text-content dark:text-content-dark">
                              {ticket.customer.email}
                            </span>
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">
                              {ticket.customer.firstName} {ticket.customer.lastName}
                            </span>
                          </div>
                        )}
                        {ticket.pincode && (
                          <div className="flex items-center gap-1.5 text-xs text-content-secondary dark:text-content-dark-secondary">
                            <span>📍</span>
                            <span>{ticket.pincode.regionName}</span>
                            <span className="text-content-tertiary dark:text-content-dark-tertiary">·</span>
                            <span>{ticket.pincode.code}</span>
                          </div>
                        )}
                      </div>

                      {/* ── 3. Issue (most important) ── */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-content-secondary dark:text-content-dark-secondary mb-0.5">
                          Issue
                        </p>
                        <p className="text-sm font-semibold text-content dark:text-content-dark leading-snug line-clamp-2">
                          {ticket.problemDescription}
                        </p>
                      </div>

                      {/* ── 4. Machine Info ── */}
                      {(ticket.machineName || ticket.machineSerialNumber || ticket.machineProductCode) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {ticket.machineName && (
                            <span className="font-medium text-content dark:text-content-dark">🔧 {ticket.machineName}</span>
                          )}
                          {ticket.machineSerialNumber && (
                            <span className="text-content-secondary dark:text-content-dark-secondary">S/N: {ticket.machineSerialNumber}</span>
                          )}
                          {ticket.machineProductCode && (
                            <span className="text-content-tertiary dark:text-content-dark-tertiary">Product: {ticket.machineProductCode}</span>
                          )}
                          {ticket.machineCustomer && (
                            <span className="text-content-tertiary dark:text-content-dark-tertiary">Cust: {ticket.machineCustomer}</span>
                          )}
                        </div>
                      )}

                      {/* ── View Details toggle ── */}
                      <div>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                          className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-primary dark:hover:text-primary-300 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-line dark:border-line-dark grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-content-secondary dark:text-content-dark-secondary">
                            {ticket.dealer && (
                              <div><span className="text-content-tertiary dark:text-content-dark-tertiary">Dealer:</span> {ticket.dealer.firstName} {ticket.dealer.lastName}</div>
                            )}
                            {ticket.responseTimeHours != null && (
                              <div><span className="text-content-tertiary dark:text-content-dark-tertiary">Response:</span> {ticket.responseTimeHours}h</div>
                            )}
                            {ticket.durationHours != null && (
                              <div><span className="text-content-tertiary dark:text-content-dark-tertiary">Duration:</span> {ticket.durationHours}h</div>
                            )}
                            <div><span className="text-content-tertiary dark:text-content-dark-tertiary">Created:</span> {formatRelativeTime(new Date(ticket.createdAt))}</div>
                          </div>
                        )}
                      </div>

                      {/* ── 5. Action Area ── */}
                      <div className="flex items-center justify-between pt-2 border-t border-line dark:border-line-dark">
                        {/* Archive / Unarchive */}
                        <button
                          onClick={() => isArchived ? handleUnarchive(ticket.id) : handleArchive(ticket.id)}
                          className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark transition-colors"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          {isArchived ? "Unarchive" : "Archive"}
                        </button>

                        {/* Assign Engineer */}
                        {canAssign && !isArchived && (
                          <div className="relative">
                            <button
                              onClick={() => setDropdownOpen(dropdownOpen === ticket.id ? null : ticket.id)}
                              disabled={assigningId === ticket.id || engineers.length === 0}
                              className={cn(
                                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                                assigningId === ticket.id
                                  ? "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                                  : "bg-primary text-white hover:bg-primary-600 disabled:opacity-50"
                              )}
                            >
                              {assigningId === ticket.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                              Assign Engineer
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {dropdownOpen === ticket.id && (
                              <div className="absolute right-0 bottom-full mb-1 w-64 z-20 rounded-xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-lg overflow-hidden">
                                <div className="px-3 py-2 border-b border-line dark:border-line-dark">
                                  <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Select Engineer</p>
                                </div>
                                {sortedEngineers.length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-content-secondary dark:text-content-dark-secondary text-center">
                                    No engineers in your zone
                                  </p>
                                ) : (
                                  sortedEngineers.map((eng, idx) => (
                                    <button
                                      key={eng.id}
                                      onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                      className={cn(
                                        "w-full text-left px-3 py-2.5 text-sm text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-between gap-2",
                                        idx === 0 && "bg-green-50 dark:bg-green-900/10"
                                      )}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        {idx === 0 && (
                                          <span className="text-green-600 dark:text-green-400 text-xs" title="Recommended (least loaded)">★</span>
                                        )}
                                        <span className="truncate">{eng.firstName} {eng.lastName}</span>
                                      </span>
                                      {eng.activeTickets !== undefined && (
                                        <span className={cn(
                                          "text-xs px-2 py-0.5 rounded-full shrink-0 font-medium",
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
