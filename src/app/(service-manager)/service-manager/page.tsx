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
  Plus,
  MapPin,
  Pencil,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type TicketTabKey = "unassigned" | "assigned" | "in_progress" | "closed" | "archived";
type DateRange = "all" | "today" | "7days" | "30days";
type PageView = "tickets" | "team";

interface PincodeInfo {
  id: string;
  code: string;
  regionName: string;
}

interface Engineer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  activeTickets?: number;
  engineerPincodes?: PincodeInfo[];
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
const TICKET_TABS: { key: TicketTabKey; label: string; statuses: TicketStatus[]; icon: React.ReactNode }[] = [
  { key: "unassigned", label: "Unassigned", statuses: ["OPEN"], icon: <AlertCircle className="w-4 h-4" /> },
  { key: "assigned", label: "Assigned", statuses: ["ASSIGNED"], icon: <UserCheck className="w-4 h-4" /> },
  { key: "in_progress", label: "In Progress", statuses: ["IN_PROGRESS", "PENDING_OTP"], icon: <Activity className="w-4 h-4" /> },
  { key: "closed", label: "Closed", statuses: ["CLOSED"], icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: "archived", label: "Archived", statuses: [], icon: <Archive className="w-4 h-4" /> },
];

// ── Urgency helpers ────────────────────────────────────────────────────
function getAgeBadge(ageHours: number) {
  if (ageHours > 24) return { color: "bg-red-100 text-red-700", label: `${ageHours}h`, urgency: "Critical" };
  if (ageHours >= 6) return { color: "bg-orange-100 text-orange-700", label: `${ageHours}h`, urgency: "Urgent" };
  return { color: "bg-emerald-100 text-emerald-700", label: `${ageHours}h`, urgency: "" };
}

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error" }> = {
  OPEN:        { label: "Open",        variant: "error" },
  ASSIGNED:    { label: "Assigned",    variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PENDING_OTP: { label: "Pending OTP", variant: "default" },
  CLOSED:      { label: "Closed",      variant: "success" },
};

function isWithinDateRange(createdAt: string, range: DateRange): boolean {
  if (range === "all") return true;
  const diffDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (range === "today") return diffDays <= 1;
  if (range === "7days") return diffDays <= 7;
  if (range === "30days") return diffDays <= 30;
  return true;
}

// ══════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════
export default function ServiceManagerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

  // ── Core state ──
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [myPincodes, setMyPincodes] = useState<PincodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ── Navigation state ──
  const [pageView, setPageView] = useState<PageView>("tickets");
  const [activeTab, setActiveTab] = useState<TicketTabKey>("unassigned");

  // ── Ticket interaction state ──
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Filter state ──
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

  // ── Team modal state — Add ──
  const [showAddEngineer, setShowAddEngineer] = useState(false);
  const [newEng, setNewEng] = useState({ firstName: "", lastName: "", email: "", password: "", pincodeIds: [] as string[] });
  const [addingEngineer, setAddingEngineer] = useState(false);

  // ── Team modal state — Edit ──
  const [editingEng, setEditingEng] = useState<Engineer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", newPassword: "", pincodeIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditModal = (eng: Engineer) => {
    setEditingEng(eng);
    setEditForm({
      firstName: eng.firstName,
      lastName: eng.lastName ?? "",
      newPassword: "",
      pincodeIds: eng.engineerPincodes?.map(p => p.id) ?? [],
    });
  };

  const closeEditModal = () => {
    setEditingEng(null);
    setEditForm({ firstName: "", lastName: "", newPassword: "", pincodeIds: [] });
  };

  const handleSaveEdit = async () => {
    if (!editingEng) return;
    if (!editForm.firstName.trim()) { setError("First name is required"); return; }
    setSavingEdit(true);
    try {
      // Update basic info (only send fields that changed, or if password provided)
      const basicBody: Record<string, string | undefined> = {};
      if (editForm.firstName.trim() !== editingEng.firstName) basicBody.firstName = editForm.firstName.trim();
      if (editForm.lastName.trim() !== (editingEng.lastName ?? "")) basicBody.lastName = editForm.lastName.trim();
      if (editForm.newPassword.trim()) {
        if (editForm.newPassword.length < 8) { setError("Password must be at least 8 characters"); setSavingEdit(false); return; }
        basicBody.newPassword = editForm.newPassword;
      }
      if (Object.keys(basicBody).length > 0) {
        const res = await fetch(`/api/manager/engineers/${editingEng.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(basicBody),
        });
        if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to update engineer"); setSavingEdit(false); return; }
      }
      // Always sync pincodes
      const pRes = await fetch(`/api/manager/engineers/${editingEng.id}/pincodes`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ pincodeIds: editForm.pincodeIds }),
      });
      if (!pRes.ok) { const { error: msg } = await pRes.json(); setError(msg || "Failed to update pincodes"); setSavingEdit(false); return; }
      closeEditModal();
      await fetchData();
    } catch { setError("Network error"); }
    finally { setSavingEdit(false); }
  };

  // Persist archived ids
  useEffect(() => {
    localStorage.setItem("sm_archived_tickets", JSON.stringify(Array.from(archivedIds)));
  }, [archivedIds]);

  const handleArchive = (id: string) => setArchivedIds(prev => new Set(prev).add(id));
  const handleUnarchive = (id: string) => {
    setArchivedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const resetFilters = () => { setSearchQuery(""); setDateRange("all"); };
  const hasActiveFilters = searchQuery !== "" || dateRange !== "all";

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "service_manager")) router.replace("/login");
  }, [user, authLoading, router]);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    try {
      const [ticketsRes, engineersRes, pincodesRes] = await Promise.all([
        fetch("/api/tickets", { credentials: "include" }),
        fetch("/api/manager/engineers", { credentials: "include" }),
        fetch("/api/manager/pincodes", { credentials: "include" }),
      ]);
      if (ticketsRes.ok) { const { tickets: d } = await ticketsRes.json(); setTickets(d ?? []); }
      if (engineersRes.ok) { const { engineers: d } = await engineersRes.json(); setEngineers(d ?? []); }
      if (pincodesRes.ok) { const { pincodes: d } = await pincodesRes.json(); setMyPincodes(d ?? []); }
    } catch { setError("Failed to load data"); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.role === "service_manager") fetchData(); }, [user, fetchData]);

  // ── Socket ──
  useEffect(() => {
    if (!user || user.role !== "service_manager") return;
    const socket = getSocket({ userId: user.id, role: user.role, name: `${user.firstName} ${user.lastName || ""}`.trim() });
    const refresh = () => fetchData();
    socket.on("ticket:new", refresh);
    socket.on("ticket:updated", refresh);
    return () => { socket.off("ticket:new", refresh); socket.off("ticket:updated", refresh); };
  }, [user, fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  const handleAssignEngineer = async (ticketId: string, engineerId: string) => {
    setAssigningId(ticketId);
    setDropdownOpen(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign-engineer`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ engineerId }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to assign"); }
      else await fetchData();
    } catch { setError("Network error"); }
    finally { setAssigningId(null); }
  };

  const handleAddEngineer = async () => {
    if (!newEng.firstName.trim() || !newEng.email.trim() || !newEng.password.trim()) {
      setError("Name, email/phone, and password are required");
      return;
    }
    setAddingEngineer(true);
    try {
      const res = await fetch("/api/manager/engineers", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          firstName: newEng.firstName.trim(),
          lastName: newEng.lastName.trim() || undefined,
          email: newEng.email.trim(),
          password: newEng.password,
          pincodeIds: newEng.pincodeIds.length > 0 ? newEng.pincodeIds : undefined,
        }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to add engineer"); }
      else {
        setShowAddEngineer(false);
        setNewEng({ firstName: "", lastName: "", email: "", password: "", pincodeIds: [] });
        await fetchData();
      }
    } catch { setError("Network error"); }
    finally { setAddingEngineer(false); }
  };

  const handleLogout = async () => { await logout(); router.replace("/login"); };

  // ── Derived data ──
  const sortedEngineers = useMemo(
    () => [...engineers].sort((a, b) => (a.activeTickets ?? 0) - (b.activeTickets ?? 0)),
    [engineers]
  );

  const displayed = useMemo(() => {
    const tab = TICKET_TABS.find(t => t.key === activeTab)!;
    let result: ServiceTicket[];
    if (activeTab === "archived") result = tickets.filter(t => archivedIds.has(t.id));
    else result = tickets.filter(t => tab.statuses.includes(t.status) && !archivedIds.has(t.id));
    if (dateRange !== "all") result = result.filter(t => isWithinDateRange(t.createdAt, dateRange));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t => {
        const tn = (t.ticketNumber ?? "").toLowerCase();
        const ce = (t.customer?.email ?? "").toLowerCase();
        const cn = `${t.customer?.firstName ?? ""} ${t.customer?.lastName ?? ""}`.toLowerCase();
        return tn.includes(q) || ce.includes(q) || cn.includes(q);
      });
    }
    return result.sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0));
  }, [tickets, activeTab, archivedIds, dateRange, searchQuery]);

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  const nonArchived = tickets.filter(t => !archivedIds.has(t.id));
  const total = nonArchived.length;
  const unassigned = nonArchived.filter(t => t.status === "OPEN").length;
  const active = nonArchived.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status)).length;
  const closed = nonArchived.filter(t => t.status === "CLOSED").length;

  // ══════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden">

      {/* ═══════════════════ HEADER ═══════════════════ */}
      <header className="shrink-0 flex items-center justify-between px-5 sm:px-8 py-4 bg-white border-b border-[#e2e8f0] shadow-sm">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-auto" />
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Service Manager</h1>
            <p className="text-xs text-gray-500">{user.firstName} {user.lastName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </button>
          <Avatar name={`${user.firstName} ${user.lastName || ""}`} size="sm" />
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* ── Error banner ── */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm shadow-sm border border-red-100">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="p-0.5"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ═══════════════════ PAGE-LEVEL NAVIGATION ═══════════════════ */}
          <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#e2e8f0] shadow-sm">
            {([
              { key: "tickets" as PageView, label: "Tickets", icon: <Ticket className="w-4 h-4" />, count: total },
              { key: "team" as PageView, label: "Team", icon: <Users className="w-4 h-4" />, count: engineers.length },
            ]).map(nav => (
              <button key={nav.key} onClick={() => setPageView(nav.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  pageView === nav.key
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}>
                {nav.icon}
                {nav.label}
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-bold",
                  pageView === nav.key ? "bg-white/20" : "bg-gray-100 text-gray-600"
                )}>{nav.count}</span>
              </button>
            ))}
          </div>

          {/* ═══════════════════ TICKETS VIEW ═══════════════════ */}
          {pageView === "tickets" && (
            <>
              {/* ── Stats Bar ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total", value: total, color: "text-gray-900", bg: "" },
                  { label: "Unassigned", value: unassigned, color: "text-red-600", bg: unassigned > 0 ? "ring-1 ring-red-200" : "" },
                  { label: "Active", value: active, color: "text-[#2563eb]", bg: "" },
                  { label: "Closed", value: closed, color: "text-emerald-600", bg: "" },
                ].map(s => (
                  <div key={s.label} className={cn("bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm", s.bg)}>
                    <p className="text-xs font-medium text-gray-500 mb-1">{s.label}</p>
                    <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Ticket Tabs ── */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-1.5 flex gap-1 overflow-x-auto">
                {TICKET_TABS.map(tab => {
                  const count = tab.key === "archived"
                    ? tickets.filter(t => archivedIds.has(t.id)).length
                    : tickets.filter(t => tab.statuses.includes(t.status) && !archivedIds.has(t.id)).length;
                  const isActive = activeTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                        isActive
                          ? "bg-[#2563eb] text-white shadow-sm"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      )}>
                      {tab.icon}
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full font-semibold",
                        isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                      )}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Filter Bar ── */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-3 flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {([
                    { key: "all" as DateRange, label: "All" },
                    { key: "today" as DateRange, label: "Today" },
                    { key: "7days" as DateRange, label: "7d" },
                    { key: "30days" as DateRange, label: "30d" },
                  ]).map(d => (
                    <button key={d.key} onClick={() => setDateRange(d.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        dateRange === d.key
                          ? "bg-[#2563eb] text-white"
                          : "text-gray-500 hover:bg-gray-100"
                      )}>{d.label}</button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search ticket # or customer..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-gray-50 border border-[#e2e8f0] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                </div>
                {hasActiveFilters && (
                  <button onClick={resetFilters}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {/* ── Ticket Cards ── */}
              <section className="space-y-3">
                {displayed.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm py-16 flex flex-col items-center text-gray-400">
                    <Ticket className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">{hasActiveFilters ? "No tickets match your filters" : `No ${(TICKET_TABS.find(t => t.key === activeTab)?.label ?? "").toLowerCase()} tickets`}</p>
                    {hasActiveFilters && <button onClick={resetFilters} className="mt-2 text-xs text-[#2563eb] hover:underline">Clear filters</button>}
                  </div>
                ) : (
                  displayed.map(ticket => {
                    const cfg = STATUS_BADGE[ticket.status];
                    const canAssign = ticket.status === "OPEN" || ticket.status === "ASSIGNED";
                    const ageBadge = typeof ticket.ageHours === "number" ? getAgeBadge(ticket.ageHours) : null;
                    const isExpanded = expandedId === ticket.id;
                    const isArchived = archivedIds.has(ticket.id);

                    return (
                      <div key={ticket.id}
                        className={cn(
                          "bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md shadow-sm",
                          ticket.status === "OPEN" && !isArchived ? "border-red-200" : "border-[#e2e8f0]"
                        )}>
                        {/* Banner */}
                        {ticket.status === "OPEN" && !isArchived && (
                          <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-xs font-semibold text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" /> Needs Assignment
                          </div>
                        )}

                        <div className="p-4 space-y-2.5">
                          {/* Row 1: Ticket # · Status · Age · Assigned */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {ticket.ticketNumber && (
                              <span className="text-sm font-mono font-bold text-gray-900">#{ticket.ticketNumber}</span>
                            )}
                            <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                            {ageBadge && (
                              <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", ageBadge.color)}>
                                {ageBadge.label}{ageBadge.urgency ? ` · ${ageBadge.urgency}` : ""}
                              </span>
                            )}
                            {ticket.assignedEngineer && (
                              <span className="ml-auto text-xs text-[#2563eb] font-medium">
                                👷 {ticket.assignedEngineer.firstName}
                              </span>
                            )}
                          </div>

                          {/* Row 2: Location */}
                          {ticket.pincode?.regionName && (
                            <p className="text-xs text-gray-500">📍 {ticket.pincode.regionName}</p>
                          )}

                          {/* Row 3: Issue */}
                          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">
                            {ticket.problemDescription}
                          </p>

                          {/* Row 4: Customer */}
                          {ticket.customer && (
                            <p className="text-xs font-medium text-gray-700">{ticket.customer.email}</p>
                          )}

                          {/* Row 5: Machine */}
                          {ticket.machineName && (
                            <p className="text-xs text-gray-500">🔧 {ticket.machineName}</p>
                          )}

                          {/* Expand toggle */}
                          <button onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#2563eb] transition-colors mt-1">
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {isExpanded ? "Hide Details" : "View Details"}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 pt-3 border-t border-[#e2e8f0] space-y-3 text-xs">
                              {ticket.customer && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">Customer</p>
                                  <p className="font-medium text-gray-800">{ticket.customer.firstName} {ticket.customer.lastName}</p>
                                  <p className="text-gray-500">{ticket.customer.email}</p>
                                </div>
                              )}
                              {ticket.pincode && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">Location</p>
                                  <p className="font-medium text-gray-800">{ticket.pincode.regionName}</p>
                                  <p className="text-gray-500">Pincode: {ticket.pincode.code}</p>
                                </div>
                              )}
                              {(ticket.machineName || ticket.machineSerialNumber || ticket.machineProductCode) && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">Machine</p>
                                  {ticket.machineName && <p className="font-medium text-gray-800">{ticket.machineName}</p>}
                                  {ticket.machineSerialNumber && <p className="text-gray-500">S/N: {ticket.machineSerialNumber}</p>}
                                  {ticket.machineProductCode && <p className="text-gray-500">Product: {ticket.machineProductCode}</p>}
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">Full Complaint</p>
                                <p className="text-gray-700 leading-relaxed">{ticket.problemDescription}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">Source</p>
                                <p className="text-gray-500">
                                  {ticket.dealer ? `Dealer — ${ticket.dealer.firstName} ${ticket.dealer.lastName ?? ""}`.trim() : "Direct"}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500">
                                {ticket.machineCustomer && <div><span className="text-gray-400">Mfr Cust:</span> {ticket.machineCustomer}</div>}
                                {ticket.responseTimeHours != null && <div><span className="text-gray-400">Response:</span> {ticket.responseTimeHours}h</div>}
                                {ticket.durationHours != null && <div><span className="text-gray-400">Duration:</span> {ticket.durationHours}h</div>}
                                <div><span className="text-gray-400">Created:</span> {formatRelativeTime(new Date(ticket.createdAt))}</div>
                              </div>
                            </div>
                          )}

                          {/* Action area */}
                          <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0]">
                            <button onClick={() => isArchived ? handleUnarchive(ticket.id) : handleArchive(ticket.id)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                              <Archive className="w-3.5 h-3.5" /> {isArchived ? "Unarchive" : "Archive"}
                            </button>

                            {canAssign && !isArchived && (
                              <div className="relative">
                                <button onClick={() => setDropdownOpen(dropdownOpen === ticket.id ? null : ticket.id)}
                                  disabled={assigningId === ticket.id || engineers.length === 0}
                                  className={cn(
                                    "flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm",
                                    assigningId === ticket.id
                                      ? "bg-gray-100 text-gray-400"
                                      : "bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                                  )}>
                                  {assigningId === ticket.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                  Assign
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>

                                {dropdownOpen === ticket.id && (
                                  <div className="absolute right-0 bottom-full mb-1 w-64 z-20 rounded-xl bg-white border border-[#e2e8f0] shadow-lg overflow-hidden">
                                    <div className="px-3 py-2 border-b border-[#e2e8f0]">
                                      <p className="text-xs font-bold text-gray-500">Select Engineer</p>
                                    </div>
                                    {sortedEngineers.length === 0 ? (
                                      <p className="px-3 py-3 text-xs text-gray-400 text-center">No engineers in your team</p>
                                    ) : (
                                      sortedEngineers.map((eng, idx) => (
                                        <button key={eng.id} onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                          className={cn(
                                            "w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2",
                                            idx === 0 && "bg-emerald-50"
                                          )}>
                                          <span className="flex items-center gap-1.5 min-w-0">
                                            {idx === 0 && <span className="text-emerald-600 text-xs" title="Least loaded">★</span>}
                                            <span className="truncate">{eng.firstName} {eng.lastName}</span>
                                          </span>
                                          {eng.activeTickets !== undefined && (
                                            <span className={cn(
                                              "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                                              eng.activeTickets === 0 ? "bg-emerald-100 text-emerald-700"
                                                : eng.activeTickets <= 3 ? "bg-amber-100 text-amber-700"
                                                  : "bg-red-100 text-red-700"
                                            )}>{eng.activeTickets} active</span>
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
                  })
                )}
              </section>
            </>
          )}

          {/* ═══════════════════ TEAM VIEW ═══════════════════ */}
          {pageView === "team" && (
            <section className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Engineers</h2>
                  <p className="text-sm text-gray-500">{engineers.length} engineer{engineers.length !== 1 ? "s" : ""} in your team</p>
                </div>
                <button onClick={() => setShowAddEngineer(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Engineer
                </button>
              </div>

              {/* My Pincodes */}
              {myPincodes.length > 0 && (
                <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Zones</p>
                  <div className="flex flex-wrap gap-2">
                    {myPincodes.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#2563eb] border border-blue-100">
                        <MapPin className="w-3 h-3" /> {p.regionName} — {p.code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Engineer list */}
              {engineers.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm py-16 flex flex-col items-center text-gray-400">
                  <Users className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No engineers yet</p>
                  <button onClick={() => setShowAddEngineer(true)} className="mt-2 text-xs text-[#2563eb] hover:underline">Add your first engineer</button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {engineers.map(eng => (
                    <div key={eng.id} className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{eng.firstName} {eng.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">{eng.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "text-xs px-2.5 py-1 rounded-full font-semibold",
                            (eng.activeTickets ?? 0) === 0 ? "bg-emerald-100 text-emerald-700"
                              : (eng.activeTickets ?? 0) <= 3 ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          )}>
                            {eng.activeTickets ?? 0} active
                          </span>
                          <button
                            onClick={() => openEditModal(eng)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 transition-colors"
                            title="Edit engineer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {eng.engineerPincodes && eng.engineerPincodes.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {eng.engineerPincodes.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-[#2563eb]">
                              <MapPin className="w-2.5 h-2.5" /> {p.regionName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 italic">No pincodes assigned</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </main>

      {/* ═══════════════════ ADD ENGINEER MODAL ═══════════════════ */}
      {showAddEngineer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-[#e2e8f0]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0]">
              <h3 className="text-base font-bold text-gray-900">Add Engineer</h3>
              <button onClick={() => setShowAddEngineer(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
                  <input type="text" value={newEng.firstName} onChange={e => setNewEng(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                    placeholder="Arun" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input type="text" value={newEng.lastName} onChange={e => setNewEng(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                    placeholder="Kumar" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email / Phone *</label>
                <input type="text" value={newEng.email} onChange={e => setNewEng(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                  placeholder="arun@example.com" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Password *</label>
                <input type="password" value={newEng.password} onChange={e => setNewEng(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                  placeholder="Min 8 characters" />
              </div>

              {myPincodes.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Assign Pincodes</label>
                  <div className="flex flex-wrap gap-2">
                    {myPincodes.map(p => {
                      const selected = newEng.pincodeIds.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setNewEng(prev => ({
                            ...prev,
                            pincodeIds: selected
                              ? prev.pincodeIds.filter(x => x !== p.id)
                              : [...prev.pincodeIds, p.id],
                          }))}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-white text-gray-600 border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]"
                          )}>
                          <MapPin className="w-3 h-3" /> {p.regionName} — {p.code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e2e8f0] bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowAddEngineer(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddEngineer} disabled={addingEngineer}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors shadow-sm">
                {addingEngineer && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Engineer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {dropdownOpen && <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />}

      {/* ═══════════════════ EDIT ENGINEER MODAL ═══════════════════ */}
      {editingEng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-[#e2e8f0]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0]">
              <div>
                <h3 className="text-base font-bold text-gray-900">Edit Engineer</h3>
                <p className="text-xs text-gray-500">{editingEng.email}</p>
              </div>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
                  <input type="text" value={editForm.firstName} onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input type="text" value={editForm.lastName} onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                </div>
              </div>

              {/* New password (optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">New Password <span className="font-normal text-gray-400">(leave blank to keep current)</span></label>
                <input type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                  placeholder="Min 8 characters" />
              </div>

              {/* Pincode multi-select — only manager's own pincodes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Assigned Pincodes
                  <span className="ml-1 font-normal text-gray-400">(your zones only)</span>
                </label>
                {myPincodes.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">You have no pincodes assigned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {myPincodes.map(p => {
                      const selected = editForm.pincodeIds.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setEditForm(prev => ({
                            ...prev,
                            pincodeIds: selected
                              ? prev.pincodeIds.filter(x => x !== p.id)
                              : [...prev.pincodeIds, p.id],
                          }))}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-white text-gray-600 border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]"
                          )}>
                          <MapPin className="w-3 h-3" /> {p.regionName} — {p.code}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e2e8f0] bg-gray-50 rounded-b-2xl">
              <button onClick={closeEditModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors shadow-sm">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
