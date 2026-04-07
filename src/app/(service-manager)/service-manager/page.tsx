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
  AlertCircle,
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
  Trash2,
  Save,
} from "lucide-react";
import { getStates, getDistricts, getPincodes, type PincodeEntry } from "@/lib/indiaLocations";
import { getSocket } from "@/lib/socket-client";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type DateRange = "all" | "today" | "7days" | "30days";
type PageView = "tickets" | "team" | "locations";

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
  activeTickets?: number;
  engineerPincodes?: PincodeInfo[];
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
}



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

// ── Parse structured problemDescription from chat-created tickets ──────────
function parseTicketDescription(desc: string) {
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


  // ── Ticket interaction state ──
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  const [drawerTicket, setDrawerTicket] = useState<ServiceTicket | null>(null);
  const [closedCollapsed, setClosedCollapsed] = useState(true);
  const [drawerReassign, setDrawerReassign] = useState(false);
  const [drawerConfirmEng, setDrawerConfirmEng] = useState<Engineer | null>(null);

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

  // ── Locations state ──
  const [locMode, setLocMode] = useState<"browse" | "custom">("browse");
  const [locState, setLocState] = useState("");
  const [locDistrict, setLocDistrict] = useState("");
  const [locSelected, setLocSelected] = useState<PincodeEntry[]>([]);
  const [savingLocations, setSavingLocations] = useState(false);
  const [deletingPincodeId, setDeletingPincodeId] = useState<string | null>(null);
  const [editingPincode, setEditingPincode] = useState<PincodeInfo | null>(null);
  const [editPincodeForm, setEditPincodeForm] = useState({ code: "", place: "", district: "", state: "" });
  const [savingPincodeEdit, setSavingPincodeEdit] = useState(false);
  // custom pincode form
  const [customForm, setCustomForm] = useState({ code: "", place: "", district: "", state: "" });
  const [customValidating, setCustomValidating] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customError, setCustomError] = useState("");

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

  // ── Custom pincode API lookup (optional, graceful) ──
  useEffect(() => {
    const code = customForm.code.trim();
    if (!/^\d{6}$/.test(code)) return;
    let cancelled = false;
    setCustomValidating(true);
    fetch(`https://api.postalpincode.in/pincode/${code}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data) && data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
          const po = data[0].PostOffice[0];
          setCustomForm(f => ({
            ...f,
            place: f.place || po.Name || "",
            district: f.district || po.District || "",
            state: f.state || po.State || "",
          }));
        }
      })
      .catch(() => { /* API unavailable — user fills manually */ })
      .finally(() => { if (!cancelled) setCustomValidating(false); });
    return () => { cancelled = true; };
  }, [customForm.code]);

  // ── Location handlers ──
  const handleSaveLocations = async () => {
    if (locSelected.length === 0) return;
    setSavingLocations(true);
    setError("");
    const existing = new Set(myPincodes.map(p => p.code));
    const toSave = locSelected
      .filter(p => !existing.has(p.code))
      .map(p => ({ code: p.code, place: p.name, district: locDistrict, state: locState }));
    if (toSave.length === 0) {
      setLocSelected([]);
      setLocState("");
      setLocDistrict("");
      setSavingLocations(false);
      return;
    }
    try {
      const res = await fetch("/api/manager/pincodes/batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ pincodes: toSave }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save pincodes");
      } else {
        setLocSelected([]);
        setLocState("");
        setLocDistrict("");
        await fetchData();
        if (data.skipped?.length > 0) setError(`${data.skipped.length} pincode(s) already existed and were skipped`);
      }
    } catch { setError("Network error"); }
    finally { setSavingLocations(false); }
  };

  const handleSaveCustom = async () => {
    setCustomError("");
    const code = customForm.code.trim();
    if (!/^\d{6}$/.test(code)) { setCustomError("Enter a valid 6-digit pincode"); return; }
    if (!customForm.place.trim()) { setCustomError("Place name is required"); return; }
    if (!customForm.district.trim()) { setCustomError("District is required"); return; }
    if (!customForm.state.trim()) { setCustomError("State is required"); return; }
    const existing = new Set(myPincodes.map(p => p.code));
    if (existing.has(code)) { setCustomError("This pincode is already added"); return; }
    setSavingCustom(true);
    try {
      const res = await fetch("/api/manager/pincodes", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ code, place: customForm.place.trim(), district: customForm.district.trim(), state: customForm.state.trim() }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setCustomError(msg || "Failed to save"); }
      else { setCustomForm({ code: "", place: "", district: "", state: "" }); await fetchData(); }
    } catch { setCustomError("Network error"); }
    finally { setSavingCustom(false); }
  };

  const handleDeletePincode = async (id: string) => {
    setDeletingPincodeId(id);
    try {
      const res = await fetch(`/api/manager/pincodes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to delete pincode"); }
      else { await fetchData(); }
    } catch { setError("Network error"); }
    finally { setDeletingPincodeId(null); }
  };

  const openEditPincode = (p: PincodeInfo) => {
    setEditingPincode(p);
    setEditPincodeForm({ code: p.code, place: p.place ?? "", district: p.district ?? "", state: p.state ?? "" });
  };

  const handleSavePincodeEdit = async () => {
    if (!editingPincode) return;
    setSavingPincodeEdit(true);
    try {
      const res = await fetch(`/api/manager/pincodes/${editingPincode.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(editPincodeForm),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to update pincode"); }
      else { setEditingPincode(null); await fetchData(); }
    } catch { setError("Network error"); }
    finally { setSavingPincodeEdit(false); }
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
    if (myPincodes.length > 0 && newEng.pincodeIds.length === 0) {
      setError("Assign at least one pincode to this engineer");
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
          pincodeIds: newEng.pincodeIds,
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



  // ── Grouped tickets for decision-focused view ──
  const ticketGroups = useMemo(() => {
    let pool = tickets.filter(t => !archivedIds.has(t.id));
    if (dateRange !== "all") pool = pool.filter(t => isWithinDateRange(t.createdAt, dateRange));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      pool = pool.filter(t => {
        const tn = (t.ticketNumber ?? "").toLowerCase();
        const ce = (t.customer?.email ?? "").toLowerCase();
        const cn = `${t.customer?.firstName ?? ""} ${t.customer?.lastName ?? ""}`.toLowerCase();
        return tn.includes(q) || ce.includes(q) || cn.includes(q);
      });
    }
    const sortByAge = (a: ServiceTicket, b: ServiceTicket) => (b.ageHours ?? 0) - (a.ageHours ?? 0);
    const urgent = pool.filter(t => (t.ageHours ?? 0) > 6 && t.status !== "CLOSED").sort(sortByAge);
    const unassigned = pool.filter(t => t.status === "OPEN" && (t.ageHours ?? 0) <= 6).sort(sortByAge);
    const inProgress = pool.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status) && (t.ageHours ?? 0) <= 6).sort(sortByAge);
    const closed = pool.filter(t => t.status === "CLOSED").sort(sortByAge);
    return { urgent, unassigned, inProgress, closed };
  }, [tickets, archivedIds, dateRange, searchQuery]);

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
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white border-b border-[#e2e8f0] shadow-sm">
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-4">

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
              { key: "locations" as PageView, label: "Locations", icon: <MapPin className="w-4 h-4" />, count: myPincodes.length },
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
              {/* ── Compact Stats + Filter Row ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-3 text-xs font-medium">
                  <span className="text-gray-500">Total <span className="font-bold text-gray-900">{total}</span></span>
                  <span className={cn("text-gray-500", unassigned > 0 && "text-red-600")}>Open <span className="font-bold">{unassigned}</span></span>
                  <span className="text-gray-500">Active <span className="font-bold text-[#2563eb]">{active}</span></span>
                  <span className="text-gray-500">Closed <span className="font-bold text-emerald-600">{closed}</span></span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
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
                            ? "bg-[#2563eb] text-white"
                            : "text-gray-400 hover:bg-gray-100"
                        )}>{d.label}</button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-40 pl-7 pr-2 py-1.5 rounded-md text-xs bg-gray-50 border border-[#e2e8f0] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#2563eb]/30 focus:border-[#2563eb]" />
                  </div>
                  {hasActiveFilters && (
                    <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600"><RotateCcw className="w-3 h-3" /></button>
                  )}
                </div>
              </div>

              {/* ── Grouped Ticket Sections ── */}
              {(() => {
                const { urgent, unassigned: unassignedGroup, inProgress: inProgressGroup, closed: closedGroup } = ticketGroups;
                const totalVisible = urgent.length + unassignedGroup.length + inProgressGroup.length + closedGroup.length;

                const renderTicketCard = (ticket: ServiceTicket) => {
                  const cfg = STATUS_BADGE[ticket.status];
                  const canAssign = ticket.status === "OPEN";
                  const isAssigned = ticket.status !== "OPEN" && ticket.status !== "CLOSED" && !!ticket.assignedEngineer;
                  const ageBadge = typeof ticket.ageHours === "number" ? getAgeBadge(ticket.ageHours) : null;
                  const isArchived = archivedIds.has(ticket.id);
                  const parsed = parseTicketDescription(ticket.problemDescription);
                  const customerDisplay = ticket.machineCustomer || parsed.customerName;
                  const locationShort = [
                    [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
                    ticket.pincode?.code,
                  ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsed.location;
                  const machineDisplay = [ticket.machineName, ticket.machineSerialNumber ? `S/N: ${ticket.machineSerialNumber}` : null].filter(Boolean).join(" · ");
                  const issueDisplay = ticket.issueDescription || (parsed.isStructured ? null : ticket.problemDescription);

                  const borderColor = (ticket.ageHours ?? 0) > 24
                    ? "border-l-red-500"
                    : (ticket.ageHours ?? 0) >= 6
                      ? "border-l-amber-400"
                      : "border-l-transparent";

                  return (
                    <div key={ticket.id}
                      className={cn(
                        "bg-white rounded-md border border-[#e2e8f0] border-l-[3px] overflow-hidden transition-shadow hover:shadow-md shadow-sm",
                        borderColor
                      )}>
                      <div className="p-3 space-y-1">

                        {/* ── Row 1: Customer | Status + Age badge ── */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {ticket.ticketNumber && (
                              <span className="text-[11px] font-mono text-gray-400 shrink-0">#{ticket.ticketNumber}</span>
                            )}
                            {customerDisplay ? (
                              <span className="font-semibold text-sm text-gray-900 leading-tight truncate">{customerDisplay}</span>
                            ) : (
                              <span className="text-sm text-gray-400 italic leading-tight">No customer</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                            {ageBadge && (
                              <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-semibold leading-none", ageBadge.color)}>
                                {ageBadge.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ── Row 2: Issue (1 line) ── */}
                        {issueDisplay && (
                          <p className="text-sm text-gray-600 leading-tight truncate">{issueDisplay}</p>
                        )}

                        {/* ── Row 3: Location · Time ── */}
                        <div className="flex items-center gap-1 text-xs text-gray-500 leading-tight">
                          {locationShort ? <>
                            <span className="shrink-0">📍</span>
                            <span className="truncate">{locationShort}</span>
                          </> : (
                            <span className="text-amber-500 font-medium flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3" /> No zone
                            </span>
                          )}
                          {ticket.createdAt && <span className="mx-0.5 text-gray-300">•</span>}
                          {ticket.createdAt && <>
                            <span className="shrink-0">⏱</span>
                            <span className="shrink-0">{formatRelativeTime(new Date(ticket.createdAt))}</span>
                          </>}
                        </div>

                        {/* ── Row 4: Machine ── */}
                        {machineDisplay && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 leading-tight">
                            <span className="shrink-0">🛠</span>
                            <span className="truncate">{machineDisplay}</span>
                          </div>
                        )}

                        {/* ── Row 5: Actions ── */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {isAssigned && ticket.assignedEngineer && (
                              <span className="inline-flex items-center gap-1 text-xs text-[#2563eb] font-medium truncate max-w-[180px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb] shrink-0" />
                                {ticket.assignedEngineer.firstName} {ticket.assignedEngineer.lastName ?? ""}
                              </span>
                            )}
                            {ticket.updatedAt && (
                              <span className="text-[10px] text-gray-400 shrink-0">{formatRelativeTime(new Date(ticket.updatedAt))}</span>
                            )}
                            <button onClick={() => setDrawerTicket(ticket)}
                              className="text-xs text-gray-400 hover:text-[#2563eb] transition-colors shrink-0">
                              Details
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {canAssign && !isArchived && (
                              <div className="relative">
                                <button onClick={() => setDropdownOpen(dropdownOpen === ticket.id ? null : ticket.id)}
                                  disabled={assigningId === ticket.id || engineers.length === 0}
                                  className={cn(
                                    "flex items-center gap-1 h-7 px-2.5 rounded text-xs font-semibold transition-all",
                                    assigningId === ticket.id
                                      ? "bg-gray-100 text-gray-400"
                                      : "bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                                  )}>
                                  {assigningId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                  Assign
                                  <ChevronDown className="w-2.5 h-2.5" />
                                </button>

                                {dropdownOpen === ticket.id && (() => {
                                  const ticketPincode = ticket.pincode;
                                  // Match by both id and code for robustness
                                  const matched = ticketPincode
                                    ? sortedEngineers.filter(e =>
                                        e.engineerPincodes?.some(p =>
                                          p.id === ticketPincode.id || p.code === ticketPincode.code
                                        )
                                      )
                                    : sortedEngineers; // no pincode on ticket → show all

                                  const hasTicketPincode = !!ticketPincode;
                                  const noZoneEngineer = hasTicketPincode && matched.length === 0;

                                  return (
                                    <div className="absolute right-0 bottom-full mb-1 w-60 z-20 rounded-lg bg-white border border-[#e2e8f0] shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                                      <div className="px-3 py-1.5 border-b border-[#e2e8f0]">
                                        <p className="text-xs font-bold text-gray-500">Select Engineer</p>
                                        {hasTicketPincode && (
                                          <p className="text-[10px] text-gray-400">
                                            Zone: {ticketPincode.code}{ticketPincode.place ? ` · ${ticketPincode.place}` : ""}
                                          </p>
                                        )}
                                      </div>
                                      {sortedEngineers.length === 0 ? (
                                        <p className="px-3 py-2 text-xs text-gray-400 text-center">No engineers in your team</p>
                                      ) : noZoneEngineer ? (
                                        <div className="px-3 py-3 text-center">
                                          <p className="text-xs font-semibold text-amber-600">No engineer assigned to zone {ticketPincode!.code}</p>
                                          <p className="text-[10px] text-gray-400 mt-0.5">Assign a pincode to an engineer in Team tab first</p>
                                        </div>
                                      ) : (
                                        matched.map(eng => (
                                          <button key={eng.id} onClick={() => handleAssignEngineer(ticket.id, eng.id)}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2">
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

                const renderGroup = (title: string, icon: string, tickets: ServiceTicket[]) => {
                  if (tickets.length === 0) return null;
                  const isClosedGroup = title === "Closed";
                  const isCollapsed = isClosedGroup && closedCollapsed;
                  return (
                    <div key={title}>
                      <button
                        onClick={() => isClosedGroup && setClosedCollapsed(c => !c)}
                        className={cn("flex items-center gap-1.5 mb-2 w-full text-left sticky top-0 z-10 bg-[#f8fafc] py-1", isClosedGroup && "cursor-pointer")}
                      >
                        <span className="text-sm">{icon}</span>
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</span>
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{tickets.length}</span>
                        {isClosedGroup && (
                          <span className="ml-auto">
                            {isCollapsed ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronUp className="w-3 h-3 text-gray-400" />}
                          </span>
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-2">
                          {tickets.map(renderTicketCard)}
                        </div>
                      )}
                    </div>
                  );
                };

                if (totalVisible === 0) {
                  return (
                    <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm py-12 flex flex-col items-center text-gray-400">
                      <Ticket className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">{hasActiveFilters ? "No tickets match your filters" : "No tickets"}</p>
                      {hasActiveFilters && <button onClick={resetFilters} className="mt-1 text-xs text-[#2563eb] hover:underline">Clear filters</button>}
                    </div>
                  );
                }

                return (
                  <div className="space-y-5">
                    {renderGroup("Urgent / Overdue", "🔥", urgent)}
                    {renderGroup("Unassigned", "⚠️", unassignedGroup)}
                    {renderGroup("In Progress", "🟢", inProgressGroup)}
                    {renderGroup("Closed", "✅", closedGroup)}
                  </div>
                );
              })()}
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
                              <MapPin className="w-2.5 h-2.5" /> {[p.place, p.district].filter(Boolean).join(", ") || p.code}
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

          {/* ═══════════════════ LOCATIONS VIEW ═══════════════════ */}
          {pageView === "locations" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Locations</h2>
                <p className="text-sm text-gray-500">Manage your service zones — {myPincodes.length} pincode{myPincodes.length !== 1 ? "s" : ""}</p>
              </div>

              {/* Add service zones card */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-4 space-y-4">
                {/* Header + mode toggle */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Add Service Zones</p>
                  <div className="flex rounded-lg border border-[#e2e8f0] overflow-hidden text-xs">
                    <button type="button"
                      onClick={() => setLocMode("browse")}
                      className={cn("px-3 py-1.5 font-semibold transition-colors",
                        locMode === "browse" ? "bg-[#2563eb] text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                      Browse
                    </button>
                    <button type="button"
                      onClick={() => { setLocMode("custom"); setCustomError(""); }}
                      className={cn("px-3 py-1.5 font-semibold transition-colors border-l border-[#e2e8f0]",
                        locMode === "custom" ? "bg-[#2563eb] text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                      Custom
                    </button>
                  </div>
                </div>

                {/* ── CUSTOM mode ── */}
                {locMode === "custom" && (() => {
                  const trimmedCode = customForm.code.trim();
                  const isDuplicate = trimmedCode.length === 6 && myPincodes.some(p => p.code === trimmedCode);
                  return (
                    <div className="space-y-3">
                      {/* Pincode */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode *</label>
                        <div className="relative">
                          <input type="text" inputMode="numeric" maxLength={6}
                            placeholder="e.g. 600001"
                            value={customForm.code}
                            onChange={e => setCustomForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                            className={cn(
                              "w-full px-3 py-2 rounded-lg text-sm border bg-gray-50 text-gray-900 focus:outline-none focus:ring-2",
                              isDuplicate
                                ? "border-amber-400 focus:ring-amber-200 focus:border-amber-400"
                                : "border-[#e2e8f0] focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                            )} />
                          {customValidating && !isDuplicate && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#2563eb]" />
                          )}
                          {isDuplicate && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
                              Already added
                            </span>
                          )}
                        </div>
                        {customValidating && !isDuplicate && <p className="text-xs text-gray-400 mt-1">Looking up pincode…</p>}
                        {isDuplicate && (
                          <p className="text-xs text-amber-600 mt-1">
                            {trimmedCode} is already in your service zones.
                          </p>
                        )}
                      </div>
                      {/* Place */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Place / Area *</label>
                        <input type="text" placeholder="e.g. Adyar"
                          value={customForm.place}
                          onChange={e => setCustomForm(f => ({ ...f, place: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                      </div>
                      {/* District + State side-by-side */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">District *</label>
                          <input type="text" placeholder="e.g. Chennai"
                            value={customForm.district}
                            onChange={e => setCustomForm(f => ({ ...f, district: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">State *</label>
                          <input type="text" placeholder="e.g. Tamil Nadu"
                            value={customForm.state}
                            onChange={e => setCustomForm(f => ({ ...f, state: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                        </div>
                      </div>
                      {customError && <p className="text-xs text-red-500">{customError}</p>}
                      <button onClick={handleSaveCustom} disabled={savingCustom || isDuplicate}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors shadow-sm">
                        {savingCustom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add Custom Pincode
                      </button>
                    </div>
                  );
                })()}

                {/* ── BROWSE mode ── */}
                {locMode === "browse" && <>
                {/* Step 1 — State */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
                  <select
                    value={locState}
                    onChange={e => { setLocState(e.target.value); setLocDistrict(""); setLocSelected([]); }}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]">
                    <option value="">Select state…</option>
                    {getStates().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Step 2 — District */}
                {locState && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">District</label>
                    <select
                      value={locDistrict}
                      onChange={e => { setLocDistrict(e.target.value); setLocSelected([]); }}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]">
                      <option value="">Select district…</option>
                      {getDistricts(locState).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}

                {/* Step 3 — Pincodes multi-select */}
                {locState && locDistrict && (() => {
                  const existing = new Set(myPincodes.map(p => p.code));
                  const available = getPincodes(locState, locDistrict);
                  return (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">Pincodes</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                        {available.map(p => {
                          const alreadySaved = existing.has(p.code);
                          const isChosen = locSelected.some(s => s.code === p.code);
                          return (
                            <button key={p.code} type="button"
                              disabled={alreadySaved}
                              onClick={() => setLocSelected(prev =>
                                isChosen ? prev.filter(s => s.code !== p.code) : [...prev, p]
                              )}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs border transition-colors",
                                alreadySaved
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-600 cursor-not-allowed opacity-60"
                                  : isChosen
                                    ? "border-[#2563eb] bg-blue-50 text-[#2563eb] font-semibold"
                                    : "border-[#e2e8f0] bg-gray-50 text-gray-700 hover:border-[#2563eb]/40 hover:bg-blue-50/50"
                              )}>
                              <span className="font-mono font-bold shrink-0">{p.code}</span>
                              <span className="truncate text-gray-500">{p.name}</span>
                              {alreadySaved && <span className="ml-auto shrink-0 text-emerald-500">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Selected chips */}
                {locSelected.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">{locSelected.length} selected</p>
                    <div className="flex flex-wrap gap-2">
                      {locSelected.map(p => (
                        <span key={p.code}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                          {p.code}
                          <button type="button" onClick={() => setLocSelected(prev => prev.filter(s => s.code !== p.code))}
                            className="ml-0.5 text-blue-400 hover:text-blue-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {error && pageView === "locations" && <p className="text-xs text-red-500">{error}</p>}

                <button onClick={handleSaveLocations}
                  disabled={savingLocations || locSelected.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors shadow-sm">
                  {savingLocations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save {locSelected.length > 0 ? `${locSelected.length} ` : ""}Zone{locSelected.length !== 1 ? "s" : ""}
                </button>
                </>}
              </div>

              {/* Pincode list */}
              {myPincodes.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm py-16 flex flex-col items-center text-gray-400">
                  <MapPin className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No locations yet</p>
                  <p className="text-xs mt-1">Add your first service zone above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myPincodes.map(p => {
                    const isEditing = editingPincode?.id === p.id;
                    return (
                      <div key={p.id} className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-3.5 space-y-3">
                        {!isEditing ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-[#2563eb] border border-blue-200">
                                {p.code}
                              </span>
                              <p className="text-xs text-gray-600 truncate">{[p.place, p.district, p.state].filter(Boolean).join(", ") || "—"}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEditPincode(p)}
                                className="p-2 rounded-lg text-gray-400 hover:text-[#2563eb] hover:bg-blue-50 transition-colors" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeletePincode(p.id)} disabled={deletingPincodeId === p.id}
                                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                {deletingPincodeId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input type="text" inputMode="numeric" maxLength={6}
                                value={editPincodeForm.code}
                                onChange={e => setEditPincodeForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                                className="px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                              <input type="text" placeholder="Place"
                                value={editPincodeForm.place}
                                onChange={e => setEditPincodeForm(f => ({ ...f, place: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                              <input type="text" placeholder="District"
                                value={editPincodeForm.district}
                                onChange={e => setEditPincodeForm(f => ({ ...f, district: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                              <input type="text" placeholder="State"
                                value={editPincodeForm.state}
                                onChange={e => setEditPincodeForm(f => ({ ...f, state: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-[#e2e8f0] bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]" />
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={handleSavePincodeEdit} disabled={savingPincodeEdit}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors">
                                {savingPincodeEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                              </button>
                              <button onClick={() => setEditingPincode(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Assign Pincodes *</label>
                  <div className="flex flex-wrap gap-2">
                    {myPincodes.map(p => {
                      const selected = newEng.pincodeIds.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setNewEng(prev => {
                            const isSelected = prev.pincodeIds.includes(p.id);
                            return {
                              ...prev,
                              pincodeIds: isSelected
                                ? prev.pincodeIds.filter(x => x !== p.id)
                                : [...prev.pincodeIds, p.id],
                            };
                          })}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-white text-gray-600 border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]"
                          )}>
                          <MapPin className="w-3 h-3" /> {[p.place, p.district].filter(Boolean).join(", ") || p.code} — {p.code}
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

      {/* ═══════════════════ TICKET DETAIL DRAWER ═══════════════════ */}
      {drawerTicket && (() => {
        const t = drawerTicket;
        const parsed = parseTicketDescription(t.problemDescription);
        const customerDisplay = t.machineCustomer || parsed.customerName;
        const isArchived = archivedIds.has(t.id);
        const cfg = STATUS_BADGE[t.status];
        const ageBadge = typeof t.ageHours === "number" ? getAgeBadge(t.ageHours) : null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => { setDrawerTicket(null); setDrawerReassign(false); setDrawerConfirmEng(null); }} />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white border-l border-[#e2e8f0] shadow-xl overflow-y-auto">
              <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-3 border-b border-[#e2e8f0]">
                <div className="flex items-center gap-2 min-w-0">
                  {t.ticketNumber && <span className="text-xs font-mono text-gray-400">#{t.ticketNumber}</span>}
                  <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
                  {ageBadge && (
                    <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-semibold", ageBadge.color)}>{ageBadge.label}</span>
                  )}
                </div>
                <button onClick={() => { setDrawerTicket(null); setDrawerReassign(false); setDrawerConfirmEng(null); }} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Customer */}
                {customerDisplay && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Customer</p>
                    <p className="text-sm font-semibold text-gray-900">{customerDisplay}</p>
                  </div>
                )}

                {/* Issue */}
                {(t.issueDescription || t.problemDescription) && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Issue</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.issueDescription || t.problemDescription}</p>
                  </div>
                )}

                {/* Address */}
                {(t.machineAddress1 || t.machineAddress2 || t.pincode || parsed.location) && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Address</p>
                    {t.machineAddress1 && <p className="text-xs text-gray-800">{t.machineAddress1}</p>}
                    {t.machineAddress2 && <p className="text-xs text-gray-600">{t.machineAddress2}</p>}
                    {t.pincode && <p className="text-xs text-gray-500">{t.pincode.code} · {[t.pincode.place, t.pincode.district, t.pincode.state].filter(Boolean).join(", ")}</p>}
                    {!t.machineAddress1 && !t.machineAddress2 && !t.pincode && parsed.location && <p className="text-xs text-gray-800">{parsed.location}</p>}
                  </div>
                )}

                {/* Machine */}
                {(t.machineName || t.machineSerialNumber || t.machineProductCode) && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Machine</p>
                    {t.machineName && <p className="text-xs text-gray-800">{t.machineName}</p>}
                    {t.machineSerialNumber && <p className="text-xs text-gray-500">S/N: {t.machineSerialNumber}</p>}
                    {t.machineProductCode && <p className="text-xs text-gray-500">Product: {t.machineProductCode}</p>}
                  </div>
                )}

                {/* Invoice / Warranty */}
                {(t.machineInvoiceNo || t.machineInvoiceDate || t.machineWarranty != null) && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Invoice / Warranty</p>
                    <div className="flex flex-wrap gap-x-4 text-xs text-gray-600">
                      {t.machineInvoiceNo && <span>Invoice: {t.machineInvoiceNo}</span>}
                      {t.machineInvoiceDate && <span>Date: {t.machineInvoiceDate}</span>}
                      {t.machineWarranty != null && <span>Warranty: {t.machineWarranty}mo</span>}
                    </div>
                  </div>
                )}

                {/* Phone */}
                {(t.phoneNumber || parsed.phone) && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Phone</p>
                    <p className="text-xs text-gray-800">{t.phoneNumber || parsed.phone}</p>
                  </div>
                )}

                {/* Assigned Engineer */}
                {t.assignedEngineer && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Engineer</p>
                    <p className="text-xs text-[#2563eb] font-medium">👷 {t.assignedEngineer.firstName} {t.assignedEngineer.lastName ?? ""}</p>
                  </div>
                )}

                {/* Meta */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Details</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>Source: {t.dealer ? `Dealer — ${t.dealer.firstName} ${t.dealer.lastName ?? ""}`.trim() : "Direct"}</span>
                    <span>Created: {formatRelativeTime(new Date(t.createdAt))}</span>
                    {t.responseTimeHours != null && <span>Response: {t.responseTimeHours}h</span>}
                    {t.durationHours != null && <span>Duration: {t.durationHours}h</span>}
                    {t.ageHours != null && <span>Age: {t.ageHours}h</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-3 border-t border-[#e2e8f0]">
                  {/* Change Engineer — only for non-closed tickets */}
                  {t.status !== "CLOSED" && (() => {
                    const ticketPincode = t.pincode;
                    const matched = ticketPincode
                      ? sortedEngineers.filter(e =>
                          e.engineerPincodes?.some(p =>
                            p.id === ticketPincode.id || p.code === ticketPincode.code
                          )
                        )
                      : sortedEngineers;

                    return (
                      <div className="space-y-2">
                        {!drawerReassign ? (
                          <button onClick={() => setDrawerReassign(true)}
                            className="flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">
                            <UserCheck className="w-3.5 h-3.5" />
                            {t.assignedEngineer ? "Change Engineer" : "Assign Engineer"}
                          </button>
                        ) : drawerConfirmEng ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-semibold text-amber-800">
                              {t.assignedEngineer ? "Reassign" : "Assign"} to {drawerConfirmEng.firstName} {drawerConfirmEng.lastName ?? ""}?
                            </p>
                            {t.assignedEngineer && (
                              <p className="text-[10px] text-amber-600">
                                Currently: {t.assignedEngineer.firstName} {t.assignedEngineer.lastName ?? ""}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  await handleAssignEngineer(t.id, drawerConfirmEng.id);
                                  setDrawerReassign(false);
                                  setDrawerConfirmEng(null);
                                  setDrawerTicket(null);
                                }}
                                disabled={assigningId === t.id}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors">
                                {assigningId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                Confirm
                              </button>
                              <button onClick={() => setDrawerConfirmEng(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                                Back
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-500">
                                Select Engineer
                                {ticketPincode && (
                                  <span className="ml-1 font-normal text-gray-400">
                                    (Zone: {ticketPincode.code})
                                  </span>
                                )}
                              </p>
                              <button onClick={() => setDrawerReassign(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                            {matched.length === 0 ? (
                              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                                No engineer assigned to zone {ticketPincode?.code ?? "—"}
                              </p>
                            ) : (
                              <div className="border border-[#e2e8f0] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                                {matched.map(eng => (
                                  <button key={eng.id} onClick={() => setDrawerConfirmEng(eng)}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 border-b border-[#e2e8f0] last:border-b-0">
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
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <button onClick={() => { if (isArchived) { handleUnarchive(t.id); } else { handleArchive(t.id); } setDrawerTicket(null); }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <Archive className="w-3.5 h-3.5" /> {isArchived ? "Unarchive" : "Archive"}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

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
                </label>
                {myPincodes.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">You have no pincodes assigned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {myPincodes.map(p => {
                      const selected = editForm.pincodeIds.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setEditForm(prev => {
                            const isSelected = prev.pincodeIds.includes(p.id);
                            return {
                              ...prev,
                              pincodeIds: isSelected
                                ? prev.pincodeIds.filter(x => x !== p.id)
                                : [...prev.pincodeIds, p.id],
                            };
                          })}
                          className={cn(
                            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            selected
                              ? "bg-[#2563eb] text-white border-[#2563eb]"
                              : "bg-white text-gray-600 border-[#e2e8f0] hover:border-[#2563eb] hover:text-[#2563eb]"
                          )}>
                          <MapPin className="w-3 h-3" /> {[p.place, p.district].filter(Boolean).join(", ") || p.code} — {p.code}
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
