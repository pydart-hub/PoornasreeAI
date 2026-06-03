"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/Loading";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import ResponsiveSidebar from "@/components/ui/ResponsiveSidebar";
import { useIsMobile } from "@/lib/useMediaQuery";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LogOut,
  RefreshCw,
  Ticket,
  UserCheck,
  Users,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Save,
  RotateCcw,
  Filter,
  Phone,
  Menu,
  PanelLeftClose,
  ShieldCheck,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";
import { TicketDrawer } from "@/components/service-manager/TicketDrawer";
import { parseTicketDescription } from "@/components/service-manager/utils";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type DateRange = "all" | "today" | "7days" | "30days";
type PageView = "tickets" | "engineers" | "locations";

interface PincodeInfo {
  id: string;
  code: string;
  place?: string | null;
  district?: string | null;
  state?: string | null;
}

interface Engineer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  whatsappNumber?: string | null;
  activeTickets?: number;
  pendingSetup?: boolean;
  engineerPincodes?: PincodeInfo[];
  hrEngineerId?: number | null;
  source?: "hr" | "local";
}

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
  machineInvoiceNo?: string | null;
  machineInvoiceDate?: string | null;
  machineWarranty?: number | null;
  ageHours?: number;
  responseTimeHours?: number | null;
  durationHours?: number | null;
  createdAt: string;
  updatedAt?: string;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  assignedManager?: { firstName: string; lastName?: string | null } | null;
  dealer?: { firstName: string; lastName?: string | null } | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
  phoneNumber?: string | null;
  customerAddress?: string | null;
}

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
export default function AssistantManagerPage() {
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Ticket interaction state ──
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [drawerTicket, setDrawerTicket] = useState<ServiceTicket | null>(null);
  const [closedCollapsed, setClosedCollapsed] = useState(true);

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [showFilters, setShowFilters] = useState(false);

  // ── Engineer modal state ──
  const [showAddEngineer, setShowAddEngineer] = useState(false);
  const [newEng, setNewEng] = useState({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [addingEngineer, setAddingEngineer] = useState(false);
  const [engineerCreated, setEngineerCreated] = useState<{ name: string; email: string; setPasswordUrl: string; hasWhatsapp: boolean } | null>(null);
  const [editingEng, setEditingEng] = useState<Engineer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", newPassword: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [resendingSetupLink, setResendingSetupLink] = useState(false);
  const [deletingEngineerId, setDeletingEngineerId] = useState<string | null>(null);

  const openEditModal = (eng: Engineer) => {
    setEditingEng(eng);
    setEditForm({
      firstName: eng.firstName,
      lastName: eng.lastName ?? "",
      email: eng.email,
      newPassword: "",
      whatsappNumber: eng.whatsappNumber ?? "",
      pincodeIds: eng.engineerPincodes?.map(p => p.id) ?? [],
    });
  };

  const closeEditModal = () => {
    setEditingEng(null);
    setEditForm({ firstName: "", lastName: "", email: "", newPassword: "", whatsappNumber: "", pincodeIds: [] });
  };

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "assistant_service_manager")) router.replace("/login");
  }, [user, authLoading, router]);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    try {
      const noCache = { credentials: "include" as const, cache: "no-store" as const };
      const [ticketsRes, engineersRes, pincodesRes] = await Promise.all([
        fetch("/api/tickets", noCache),
        fetch("/api/manager/engineers", noCache),
        fetch("/api/manager/pincodes", noCache),
      ]);
      if (ticketsRes.ok) { const { tickets: d } = await ticketsRes.json(); setTickets(d ?? []); }
      if (engineersRes.ok) { const { engineers: d } = await engineersRes.json(); setEngineers(d ?? []); }
      if (pincodesRes.ok) { const { pincodes: d } = await pincodesRes.json(); setMyPincodes(d ?? []); }
    } catch { setError("Failed to load data"); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.role === "assistant_service_manager") fetchData(); }, [user, fetchData]);

  // ── Socket ──
  useEffect(() => {
    if (!user || user.role !== "assistant_service_manager") return;
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

  const handleResendSetupLink = async (eng: Engineer) => {
    setResendingSetupLink(true);
    try {
      const res = await fetch(`/api/manager/engineers/${eng.id}/resend-setup-link`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg || "Failed to resend setup link");
        return;
      }
      const data = await res.json();
      setEngineerCreated({
        name: `${eng.firstName}${eng.lastName ? " " + eng.lastName : ""}`.trim(),
        email: eng.email,
        setPasswordUrl: data.setPasswordUrl,
        hasWhatsapp: data.sentViaWhatsapp,
      });
      await fetchData();
    } catch {
      setError("Network error");
    } finally {
      setResendingSetupLink(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEng) return;
    if (!editForm.firstName.trim()) { setError("First name is required"); return; }
    if (!editForm.email.trim()) { setError("Email is required"); return; }
    setSavingEdit(true);
    try {
      const basicBody: Record<string, string | undefined> = {};
      if (editForm.firstName.trim() !== editingEng.firstName) basicBody.firstName = editForm.firstName.trim();
      if (editForm.lastName.trim() !== (editingEng.lastName ?? "")) basicBody.lastName = editForm.lastName.trim();
      if (editForm.email.trim().toLowerCase() !== editingEng.email.toLowerCase()) basicBody.email = editForm.email.trim();
      if (editForm.whatsappNumber.trim() !== (editingEng.whatsappNumber ?? "")) basicBody.whatsappNumber = editForm.whatsappNumber.trim();
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

  const handleLogout = async () => { await logout(); router.replace("/login"); };

  // ── Derived stats ──
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (!isWithinDateRange(t.createdAt, dateRange)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const parsed = parseTicketDescription(t.problemDescription);
        const parsedIssue = parseTicketDescription(t.issueDescription ?? "");
        const haystack = [
          t.ticketNumber,
          t.machineCustomer,
          t.machineSerialNumber,
          t.machineName,
          t.problemDescription,
          t.pincode?.code,
          t.pincode?.place,
          t.pincode?.district,
          t.phoneNumber,
          t.assignedEngineer?.firstName,
          parsed.customerName,
          parsedIssue.customerName,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, searchQuery, dateRange]);

  const ticketGroups = useMemo(() => {
    const visible = filteredTickets.filter(t => t.status !== "CLOSED");
    const closed = filteredTickets.filter(t => t.status === "CLOSED");
    const urgent = visible.filter(t => (t.ageHours ?? 0) > 24 && t.status !== "CLOSED");
    const unassigned = visible.filter(t => t.status === "OPEN" && !urgent.includes(t));
    const inProgress = visible.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status) && !urgent.includes(t));
    return { urgent, unassigned, inProgress, closed };
  }, [filteredTickets]);

  const { urgent, unassigned, inProgress, closed } = ticketGroups;
  const total = filteredTickets.length;
  const activeCount = inProgress.length + urgent.length;
  const closedCount = closed.length;
  const hasActiveFilters = searchQuery !== "" || dateRange !== "all";

  const sortedEngineers = useMemo(() => {
    return [...engineers].sort((a, b) => (a.activeTickets ?? 0) - (b.activeTickets ?? 0));
  }, [engineers]);

  const resetFilters = () => { setSearchQuery(""); setDateRange("all"); };

  if (authLoading || loading) return <LoadingScreen />;
  if (!user || user.role !== "assistant_service_manager") return null;

  return (
    <div className="flex h-[100dvh] bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260} className="overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950 via-amber-900 to-orange-900" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-orange-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Asst. Manager</p>
              <p className="text-[10px] text-white/50 font-medium">Poornasree AI</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {([
              { key: "tickets" as PageView, label: "Tickets", icon: <Ticket className="w-4 h-4" />, count: total },
              { key: "engineers" as PageView, label: "Engineers", icon: <Users className="w-4 h-4" />, count: engineers.length },
              { key: "locations" as PageView, label: "Locations", icon: <MapPin className="w-4 h-4" />, count: myPincodes.length },
            ]).map((nav) => (
              <button key={nav.key} onClick={() => { setPageView(nav.key); if (isMobile) setSidebarOpen(false); }}
                className={cn(
                  "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  pageView === nav.key
                    ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                )}>
                {pageView === nav.key && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-400 rounded-full" />
                )}
                <span className={cn(pageView === nav.key ? "text-amber-300" : "text-white/50 group-hover:text-white/70")}>
                  {nav.icon}
                </span>
                <span className="flex-1 text-left">{nav.label}</span>
                {nav.count != null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                    {nav.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user.firstName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.firstName} {user.lastName ?? ""}</p>
                <p className="text-[10px] text-white/50 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      {/* ═══════════════════ MAIN PANEL ═══════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* ── Top header ── */}
        <header className="flex items-center gap-2 px-4 py-2.5 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(s => !s)}
            className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0">
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-content dark:text-content-dark">
            {pageView === "tickets" ? "Tickets" : pageView === "engineers" ? "Engineers" : "My Locations"}
          </span>
          {myPincodes.length === 0 && pageView === "tickets" && (
            <span className="hidden sm:inline text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20">
              No pincodes assigned yet
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-content-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-6 space-y-4">

            {/* ── Error banner ── */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm shadow-sm border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError("")} className="p-0.5"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* ── No pincodes notice ── */}
            {myPincodes.length === 0 && pageView === "tickets" && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">No service zones assigned</p>
                  <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-500">Your service manager needs to assign pincodes to your account before you can see tickets.</p>
                </div>
              </div>
            )}

            {/* ═══════════════════ TICKETS VIEW ═══════════════════ */}
            {pageView === "tickets" && (
              <>
                {/* ── Stats + Filter Row ── */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <span className="text-content-secondary dark:text-content-dark-secondary">Total <span className="font-bold text-content dark:text-content-dark">{total}</span></span>
                    <span className={cn("text-content-secondary dark:text-content-dark-secondary", unassigned.length > 0 && "text-red-600")}>Open <span className="font-bold">{unassigned.length}</span></span>
                    <span className="text-content-secondary dark:text-content-dark-secondary">Active <span className="font-bold text-primary">{activeCount}</span></span>
                    <span className="text-content-secondary dark:text-content-dark-secondary">Closed <span className="font-bold text-emerald-600">{closedCount}</span></span>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {([
                        { key: "all" as DateRange, label: "All" },
                        { key: "today" as DateRange, label: "Today" },
                        { key: "7days" as DateRange, label: "7d" },
                        { key: "30days" as DateRange, label: "30d" },
                      ]).map(d => (
                        <button key={d.key} onClick={() => setDateRange(d.key)}
                          className={cn(
                            "px-2 py-1 rounded text-xs font-medium transition-colors",
                            dateRange === d.key
                              ? "bg-primary text-white"
                              : "text-content-tertiary dark:text-content-dark-tertiary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"
                          )}>{d.label}</button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary dark:text-content-dark-tertiary" />
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full sm:w-40 pl-7 pr-2 py-1.5 rounded-md text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content dark:text-content-dark placeholder:text-content-tertiary dark:placeholder:text-content-dark-tertiary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary" />
                    </div>
                    {hasActiveFilters && (
                      <button onClick={resetFilters} className="text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary"><RotateCcw className="w-3 h-3" /></button>
                    )}
                    <button onClick={() => setShowFilters(f => !f)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                        showFilters ? "bg-primary text-white" : "text-content-tertiary dark:text-content-dark-tertiary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"
                      )}>
                      <Filter className="w-3 h-3" /> Filters
                    </button>
                  </div>
                </div>

                {/* ── Ticket Groups ── */}
                {(() => {
                  const totalVisible = urgent.length + unassigned.length + inProgress.length + closed.length;

                  const renderTicketCard = (ticket: ServiceTicket) => {
                    const canAssign = ticket.status === "OPEN";
                    const parsed = parseTicketDescription(ticket.problemDescription);
                    const parsedIssue = parseTicketDescription(ticket.issueDescription ?? "");
                    const customerDisplay = ticket.machineCustomer || parsedIssue.customerName || parsed.customerName || ticket.customer?.firstName;
                    const locationShort = [
                      [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
                      ticket.pincode?.code,
                    ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsed.location;
                    const complaintDisplay = ticket.problemDescription;
                    const isPending = ticket.status === "OPEN" && !ticket.assignedEngineer;
                    const borderColor = (ticket.ageHours ?? 0) > 24
                      ? "border-l-red-500"
                      : (ticket.ageHours ?? 0) >= 6
                        ? "border-l-amber-400"
                        : "border-l-transparent";

                    return (
                      <div key={ticket.id}
                        onClick={() => setDrawerTicket(ticket)}
                        className={cn(
                          "bg-surface-card dark:bg-surface-dark-card rounded-md border border-line dark:border-line-dark border-l-[3px] overflow-hidden transition-shadow hover:shadow-md shadow-sm cursor-pointer",
                          borderColor
                        )}>
                        <div className="p-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {ticket.ticketNumber && (
                                <span className="text-sm font-bold text-primary shrink-0">#{ticket.ticketNumber}</span>
                              )}
                              {customerDisplay ? (
                                <span className="font-semibold text-sm text-content dark:text-content-dark leading-tight truncate">{customerDisplay}</span>
                              ) : (
                                <span className="text-sm text-content-tertiary dark:text-content-dark-tertiary italic leading-tight">No customer</span>
                              )}
                            </div>
                            {isPending && (
                              <span className="text-[11px] px-2 py-0.5 rounded font-semibold leading-none bg-amber-100 text-amber-700 border border-amber-300 shrink-0">
                                Pending
                              </span>
                            )}
                          </div>
                          {ticket.machineSerialNumber && (
                            <div className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary leading-tight">
                              <span className="shrink-0">🔢</span>
                              <span className="font-mono font-medium">S/N: {ticket.machineSerialNumber}</span>
                            </div>
                          )}
                          {complaintDisplay && (
                            <p className="text-sm text-content-secondary dark:text-content-dark-secondary leading-tight truncate">{complaintDisplay}</p>
                          )}
                          <div className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary leading-tight">
                            {locationShort ? <>
                              <span className="shrink-0">📍</span>
                              <span className="truncate">{locationShort}</span>
                            </> : (
                              <span className="text-amber-500 font-medium flex items-center gap-0.5">
                                <AlertCircle className="w-3 h-3" /> No zone
                              </span>
                            )}
                            {ticket.createdAt && <span className="mx-0.5 text-content-tertiary dark:text-content-dark-tertiary">•</span>}
                            {ticket.createdAt && <>
                              <span className="shrink-0">⏱</span>
                              <span className="shrink-0">{formatRelativeTime(new Date(ticket.createdAt))}</span>
                            </>}
                          </div>
                          <div className="flex items-center justify-end pt-1">
                            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                              {canAssign && (
                                <div className="relative">
                                  <button onClick={() => setDropdownOpen(dropdownOpen === ticket.id ? null : ticket.id)}
                                    disabled={assigningId === ticket.id || engineers.length === 0}
                                    className={cn(
                                      "flex items-center gap-1 h-7 px-2.5 rounded text-xs font-semibold transition-all",
                                      assigningId === ticket.id
                                        ? "bg-surface-secondary dark:bg-surface-dark-secondary text-content-tertiary dark:text-content-dark-tertiary"
                                        : "bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                                    )}>
                                    {assigningId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                    Assign
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  </button>
                                  {dropdownOpen === ticket.id && (() => {
                                    const ticketPincode = ticket.pincode;
                                    const matched = ticketPincode
                                      ? sortedEngineers.filter(e =>
                                          e.engineerPincodes?.some(p =>
                                            p.id === ticketPincode.id || p.code === ticketPincode.code
                                          )
                                        )
                                      : [];
                                    const hasTicketPincode = !!ticketPincode;
                                    const noZoneEngineer = hasTicketPincode && matched.length === 0;
                                    return (
                                      <div className="absolute right-0 bottom-full mb-1 w-60 z-20 rounded-lg bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                                        <div className="px-3 py-1.5 border-b border-line dark:border-line-dark">
                                          <p className="text-xs font-bold text-content-secondary dark:text-content-dark-secondary">Select Engineer</p>
                                          {hasTicketPincode ? (
                                            <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
                                              Zone: {ticketPincode.code}{ticketPincode.place ? ` · ${ticketPincode.place}` : ""}
                                            </p>
                                          ) : (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                              ⚠ No zone on ticket
                                            </p>
                                          )}
                                        </div>
                                        {engineers.length === 0 ? (
                                          <p className="px-3 py-2 text-xs text-content-tertiary dark:text-content-dark-tertiary text-center">No engineers in your team</p>
                                        ) : !hasTicketPincode ? (
                                          <p className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400 text-center">Set a pincode on the ticket first</p>
                                        ) : noZoneEngineer ? (
                                          <p className="px-3 py-2 text-xs text-amber-600 font-semibold text-center">No engineer for zone {ticketPincode!.code}</p>
                                        ) : (
                                          matched.map(eng => (
                                            <button key={eng.id} onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                              className="w-full text-left px-3 py-2 text-xs text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-between gap-2">
                                              <span className="flex items-center gap-1 min-w-0">
                                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                                <span className="truncate">{eng.firstName} {eng.lastName}</span>
                                              </span>
                                              {eng.activeTickets !== undefined && (
                                                <span className={cn(
                                                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                                                  eng.activeTickets === 0 ? "bg-emerald-100 text-emerald-700"
                                                    : eng.activeTickets <= 3 ? "bg-amber-100 text-amber-700"
                                                      : "bg-red-100 text-red-700"
                                                )}>{eng.activeTickets}</span>
                                              )}
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  };

                  const renderGroup = (title: string, icon: string, groupTickets: ServiceTicket[]) => {
                    if (groupTickets.length === 0) return null;
                    const isClosedGroup = title === "Closed";
                    const isCollapsed = isClosedGroup && closedCollapsed;
                    return (
                      <div key={title}>
                        <button
                          onClick={() => isClosedGroup && setClosedCollapsed(c => !c)}
                          className={cn("flex items-center gap-1.5 mb-2 w-full text-left sticky top-0 z-10 bg-surface dark:bg-surface-dark py-1", isClosedGroup && "cursor-pointer")}
                        >
                          <span className="text-sm">{icon}</span>
                          <span className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">{title}</span>
                          <span className="text-xs font-bold text-content-tertiary dark:text-content-dark-tertiary bg-surface-secondary dark:bg-surface-dark-secondary px-1.5 py-0.5 rounded">{groupTickets.length}</span>
                          {isClosedGroup && (
                            <span className="ml-auto">
                              {isCollapsed ? <ChevronDown className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" /> : <ChevronUp className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" />}
                            </span>
                          )}
                        </button>
                        {!isCollapsed && (
                          <div className="space-y-2">
                            {groupTickets.map(renderTicketCard)}
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (totalVisible === 0) {
                    return (
                      <div className="bg-surface-card dark:bg-surface-dark-card rounded-lg border border-line dark:border-line-dark shadow-sm py-12 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                        <Ticket className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">{hasActiveFilters ? "No tickets match your filters" : "No tickets in your zones"}</p>
                        {hasActiveFilters && <button onClick={resetFilters} className="mt-1 text-xs text-primary hover:underline">Clear filters</button>}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      {renderGroup("Urgent / Overdue", "🔥", urgent)}
                      {renderGroup("Unassigned", "⚠️", unassigned)}
                      {renderGroup("In Progress", "🟢", inProgress)}
                      {renderGroup("Closed", "✅", closed)}
                    </div>
                  );
                })()}
              </>
            )}

            {/* ═══════════════════ ENGINEERS VIEW ═══════════════════ */}
            {pageView === "engineers" && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-content dark:text-content-dark">Engineers</h2>
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">{engineers.length} engineer{engineers.length !== 1 ? "s" : ""} in your team</p>
                  </div>
                  <button onClick={() => setShowAddEngineer(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add Engineer
                  </button>
                </div>

                {engineers.length === 0 ? (
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                    <Users className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">No engineers yet</p>
                    <button onClick={() => setShowAddEngineer(true)} className="mt-2 text-xs text-primary hover:underline">Add your first engineer</button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {engineers.map(eng => (
                      <div key={eng.id} className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-content dark:text-content-dark truncate">{eng.firstName} {eng.lastName}</p>
                              <span className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                                eng.source === "hr"
                                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              )}>
                                {eng.source === "hr" ? "HR" : "Local"}
                              </span>
                              {eng.pendingSetup && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                  Pending setup
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{eng.email}</p>
                            {eng.whatsappNumber && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" /> {eng.whatsappNumber}
                              </p>
                            )}
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
                            {eng.pendingSetup && (
                              <button
                                onClick={() => handleResendSetupLink(eng)}
                                disabled={resendingSetupLink}
                                className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                title="Resend setup link"
                              >
                                {resendingSetupLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(eng)}
                              className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-primary hover:bg-blue-50 transition-colors"
                              title="Edit engineer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {eng.source !== "hr" && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete ${eng.firstName}${eng.lastName ? " " + eng.lastName : ""}? Make sure all their tickets are reassigned first.`)) return;
                                  setDeletingEngineerId(eng.id);
                                  try {
                                    const res = await fetch(`/api/manager/engineers/${eng.id}`, { method: "DELETE", credentials: "include" });
                                    if (!res.ok) {
                                      const data = await res.json();
                                      if (data.activeTickets?.length > 0) {
                                        const list = data.activeTickets.map((t: { ticketNumber: string }) => t.ticketNumber).join(", ");
                                        setError(`Reassign active ticket(s) first: ${list}`);
                                      } else {
                                        setError(data.error || "Failed to delete engineer");
                                      }
                                    } else { await fetchData(); }
                                  } catch { setError("Network error"); }
                                  finally { setDeletingEngineerId(null); }
                                }}
                                disabled={deletingEngineerId === eng.id}
                                className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete engineer"
                              >
                                {deletingEngineerId === eng.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                        {eng.engineerPincodes && eng.engineerPincodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {eng.engineerPincodes.map(p => (
                              <span key={p.id} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-primary">
                                <MapPin className="w-2.5 h-2.5" /> {[p.place, p.district].filter(Boolean).join(", ") || p.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary italic">No pincodes assigned</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Add Engineer Modal ── */}
                {showAddEngineer && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-content dark:text-content-dark">Add Engineer</h3>
                        <button onClick={() => setShowAddEngineer(false)} className="p-1.5 rounded-lg hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                          <input value={newEng.firstName} onChange={e => setNewEng(f => ({ ...f, firstName: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                          <input value={newEng.lastName} onChange={e => setNewEng(f => ({ ...f, lastName: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Login email *</label>
                        <input type="email" value={newEng.email} onChange={e => setNewEng(f => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Used at login. After setup, first name also works as username.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                        <input type="tel" value={newEng.whatsappNumber} onChange={e => setNewEng(f => ({ ...f, whatsappNumber: e.target.value }))}
                          placeholder="e.g. 919876543210"
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      {myPincodes.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Assign Pincodes</label>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {myPincodes.map(p => (
                              <button key={p.id} type="button"
                                onClick={() => setNewEng(f => ({
                                  ...f,
                                  pincodeIds: f.pincodeIds.includes(p.id)
                                    ? f.pincodeIds.filter(id => id !== p.id)
                                    : [...f.pincodeIds, p.id],
                                }))}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                  newEng.pincodeIds.includes(p.id)
                                    ? "bg-primary text-white border-primary"
                                    : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary"
                                )}>
                                {p.code}{p.place ? ` · ${p.place}` : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setShowAddEngineer(false)}
                          className="flex-1 px-4 py-2 rounded-lg text-sm border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                          Cancel
                        </button>
                        <button
                          disabled={addingEngineer}
                          onClick={async () => {
                            if (!newEng.firstName.trim() || !newEng.email.trim()) { setError("Name and email are required"); return; }
                            setAddingEngineer(true);
                            try {
                              const res = await fetch("/api/manager/engineers", {
                                method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                                body: JSON.stringify({
                                  firstName: newEng.firstName.trim(),
                                  lastName: newEng.lastName.trim() || undefined,
                                  email: newEng.email.trim(),
                                  whatsappNumber: newEng.whatsappNumber.trim() || undefined,
                                  pincodeIds: newEng.pincodeIds,
                                }),
                              });
                              if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to add engineer"); }
                              else {
                                const data = await res.json();
                                setShowAddEngineer(false);
                                setEngineerCreated({ name: newEng.firstName.trim(), email: newEng.email.trim(), setPasswordUrl: data.setPasswordUrl, hasWhatsapp: !!newEng.whatsappNumber.trim() });
                                setNewEng({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] });
                                await fetchData();
                              }
                            } catch { setError("Network error"); }
                            finally { setAddingEngineer(false); }
                          }}
                          className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                          {addingEngineer ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create Engineer"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Engineer Created Banner ── */}
                {engineerCreated && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                          <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-content dark:text-content-dark">Engineer Created!</h3>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{engineerCreated.name} — {engineerCreated.email}</p>
                        </div>
                      </div>
                      {engineerCreated.hasWhatsapp ? (
                        <p className="text-sm text-content-secondary dark:text-content-dark-secondary">A set-password link was sent via WhatsApp — if delivery failed, copy the link below.</p>
                      ) : null}
                      <div className="space-y-1">
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Share this set-password link with the engineer:</p>
                        <div className="flex items-center gap-2 bg-surface dark:bg-surface-dark rounded-lg px-3 py-2 border border-line dark:border-line-dark">
                          <span className="text-xs font-mono text-content dark:text-content-dark truncate flex-1">{engineerCreated.setPasswordUrl}</span>
                          <button onClick={() => navigator.clipboard?.writeText(engineerCreated.setPasswordUrl)} className="shrink-0 p-1 rounded hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary text-content-secondary dark:text-content-dark-secondary" title="Copy">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <button onClick={() => setEngineerCreated(null)} className="w-full px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors">Done</button>
                    </div>
                  </div>
                )}

                {/* ── Edit Engineer Modal ── */}
                {editingEng && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-content dark:text-content-dark">Edit Engineer</h3>
                          {editingEng.pendingSetup && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">This engineer has not set a password yet.</p>
                          )}
                        </div>
                        <button onClick={closeEditModal} className="p-1.5 rounded-lg hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                          <input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                          <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Login email *</label>
                        <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                        <input type="tel" value={editForm.whatsappNumber} onChange={e => setEditForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Set login password <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">(optional)</span></label>
                        <input type="password" value={editForm.newPassword} onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                          placeholder="Min 8 characters"
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Use this if the engineer lost the setup link.</p>
                      </div>
                      <div className="rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-3 py-3 space-y-2">
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Send a fresh set-password link (expires in 7 days).</p>
                        <button
                          type="button"
                          onClick={() => handleResendSetupLink(editingEng)}
                          disabled={resendingSetupLink}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-primary text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
                        >
                          {resendingSetupLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          Resend setup link
                        </button>
                      </div>
                      {myPincodes.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Assigned Pincodes</label>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {myPincodes.map(p => (
                              <button key={p.id} type="button"
                                onClick={() => setEditForm(f => ({
                                  ...f,
                                  pincodeIds: f.pincodeIds.includes(p.id)
                                    ? f.pincodeIds.filter(id => id !== p.id)
                                    : [...f.pincodeIds, p.id],
                                }))}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                  editForm.pincodeIds.includes(p.id)
                                    ? "bg-primary text-white border-primary"
                                    : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary"
                                )}>
                                {p.code}{p.place ? ` · ${p.place}` : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={closeEditModal}
                          className="flex-1 px-4 py-2 rounded-lg text-sm border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                          Cancel
                        </button>
                        <button
                          disabled={savingEdit}
                          onClick={handleSaveEdit}
                          className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                          {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ═══════════════════ LOCATIONS VIEW ═══════════════════ */}
            {pageView === "locations" && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-content dark:text-content-dark">My Locations</h2>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                    {myPincodes.length > 0
                      ? `${myPincodes.length} pincode zone${myPincodes.length !== 1 ? "s" : ""} assigned to you`
                      : "No zones assigned yet — contact your service manager"}
                  </p>
                </div>
                {myPincodes.length === 0 ? (
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                    <MapPin className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">No pincodes assigned</p>
                    <p className="text-xs mt-1 text-center max-w-xs">Your service manager needs to assign pincodes to your account. Once assigned, you will see tickets from those zones.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {myPincodes.map(p => (
                      <div key={p.id} className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-bold text-content dark:text-content-dark font-mono">{p.code}</span>
                        </div>
                        {p.place && <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{p.place}</p>}
                        {p.district && <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary">{p.district}{p.state ? `, ${p.state}` : ""}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

          </div>
        </main>
      </div>

      {/* ── Ticket Drawer ── */}
      {drawerTicket && (
        <TicketDrawer
          ticket={drawerTicket}
          engineers={engineers}
          isArchived={false}
          assigningId={assigningId}
          onClose={() => setDrawerTicket(null)}
          onAssignEngineer={handleAssignEngineer}
          onCancelAssignment={async (ticketId) => {
            try {
              const res = await fetch(`/api/tickets/${ticketId}/unassign-engineer`, {
                method: "PATCH", credentials: "include",
              });
              if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to unassign"); }
              else { await fetchData(); setDrawerTicket(null); }
            } catch { setError("Network error"); }
          }}
          onArchive={() => {}}
          onUnarchive={() => {}}
        />
      )}

    </div>
  );
}
