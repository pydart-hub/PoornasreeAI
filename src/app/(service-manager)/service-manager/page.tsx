"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingScreen } from "@/components/ui/Loading";
import { Logo } from "@/components/ui/Logo";
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
  Download,
  Store,
  Phone,
  Menu,
  PanelLeftClose,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { getStates, getDistricts, getPincodes, type PincodeEntry } from "@/lib/indiaLocations";
import { getSocket } from "@/lib/socket-client";
import { TicketDrawer } from "@/components/service-manager/TicketDrawer";
import { parseTicketDescription } from "@/components/service-manager/utils";
import {
  type WorkReport,
  type ReplacedPart,
  type WorkReportImage,
  listWorkReports,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type DateRange = "all" | "today" | "7days" | "30days";
type PageView = "tickets" | "engineers" | "locations" | "dealers" | "work-reports" | "assistants";

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
  engineerPincodes?: PincodeInfo[];
}

interface Dealer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  warrantyMonths?: number | null;
  pincode?: { code: string; place?: string | null; district?: string | null; state?: string | null } | null;
  createdAt: string;
  ticketCount?: number;
}

interface AssistantManager {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  whatsappNumber?: string | null;
  createdAt: string;
  engineerPincodes: PincodeInfo[];
  _count: { managedEngineers: number };
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



// ── Urgency helpers (imported from @/components/service-manager/utils) ──

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  // ── Responsive ──
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // ── Ticket interaction state ──
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  const [drawerTicket, setDrawerTicket] = useState<ServiceTicket | null>(null);
  const [closedCollapsed, setClosedCollapsed] = useState(true);
  const [, setDrawerReassign] = useState(false);
  const [, setDrawerConfirmEng] = useState<Engineer | null>(null);

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [dealerFilter, setDealerFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [complaintFilter, setComplaintFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
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
  const [newEng, setNewEng] = useState({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [addingEngineer, setAddingEngineer] = useState(false);
  const [engineerCreated, setEngineerCreated] = useState<{ name: string; email: string; setPasswordUrl: string; hasWhatsapp: boolean } | null>(null);

  // ── Team modal state — Edit ──
  const [editingEng, setEditingEng] = useState<Engineer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", newPassword: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());

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

  // ── Work Reports state ──
  const [workReports, setWorkReports] = useState<WorkReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WorkReport | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // ── Dealer state ──
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [showAddDealer, setShowAddDealer] = useState(false);
  const [newDealer, setNewDealer] = useState({ firstName: "", lastName: "", email: "", password: "", warrantyMonths: "" as string, pincode: "" });
  const [addingDealer, setAddingDealer] = useState(false);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [editDealerForm, setEditDealerForm] = useState({ firstName: "", lastName: "", newPassword: "", warrantyMonths: "" as string, pincode: "" });
  const [savingDealerEdit, setSavingDealerEdit] = useState(false);
  const [deletingDealerId, setDeletingDealerId] = useState<string | null>(null);
  const [deletingEngineerId, setDeletingEngineerId] = useState<string | null>(null);

  // ── Assistant Manager state ──
  const [assistants, setAssistants] = useState<AssistantManager[]>([]);
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [newAsst, setNewAsst] = useState({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [addingAssistant, setAddingAssistant] = useState(false);
  const [assistantCreated, setAssistantCreated] = useState<{ name: string; email: string; setPasswordUrl: string; hasWhatsapp: boolean } | null>(null);
  const [editingAsst, setEditingAsst] = useState<AssistantManager | null>(null);
  const [editAsstForm, setEditAsstForm] = useState({ firstName: "", lastName: "", newPassword: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [savingAsstEdit, setSavingAsstEdit] = useState(false);
  const [deletingAsstId, setDeletingAsstId] = useState<string | null>(null);
  const [newAsstPincodeState, setNewAsstPincodeState] = useState("");
  const [editAsstPincodeState, setEditAsstPincodeState] = useState("");

  const openEditModal = (eng: Engineer) => {
    setEditingEng(eng);
    setEditForm({
      firstName: eng.firstName,
      lastName: eng.lastName ?? "",
      newPassword: "",
      whatsappNumber: eng.whatsappNumber ?? "",
      pincodeIds: eng.engineerPincodes?.map(p => p.id) ?? [],
    });
  };

  const closeEditModal = () => {
    setEditingEng(null);
    setEditForm({ firstName: "", lastName: "", newPassword: "", whatsappNumber: "", pincodeIds: [] });
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

  const handleArchive = (id: string) => setArchivedIds(prev => new Set(Array.from(prev)).add(id));
  const handleUnarchive = (id: string) => {
    setArchivedIds(prev => { const next = new Set(Array.from(prev)); next.delete(id); return next; });
  };

  const resetFilters = () => { setSearchQuery(""); setDateRange("all"); setDealerFilter(""); setModelFilter(""); setComplaintFilter(""); };
  const hasActiveFilters = searchQuery !== "" || dateRange !== "all" || dealerFilter !== "" || modelFilter !== "" || complaintFilter !== "";

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "service_manager")) router.replace("/login");
  }, [user, authLoading, router]);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    try {
      const noCache = { credentials: "include" as const, cache: "no-store" as const };
      const [ticketsRes, engineersRes, pincodesRes, dealersRes, assistantsRes] = await Promise.all([
        fetch("/api/tickets", noCache),
        fetch("/api/manager/engineers", noCache),
        fetch("/api/manager/pincodes", noCache),
        fetch("/api/manager/dealers", noCache),
        fetch("/api/manager/assistants", noCache),
      ]);
      if (ticketsRes.ok) { const { tickets: d } = await ticketsRes.json(); setTickets(d ?? []); }
      if (engineersRes.ok) { const { engineers: d } = await engineersRes.json(); setEngineers(d ?? []); }
      if (pincodesRes.ok) { const { pincodes: d } = await pincodesRes.json(); setMyPincodes(d ?? []); }
      if (dealersRes.ok) { const { dealers: d } = await dealersRes.json(); setDealers(d ?? []); }
      if (assistantsRes.ok) { const { assistants: d } = await assistantsRes.json(); setAssistants(d ?? []); }
      // Work reports
      try { const reports = await listWorkReports(); setWorkReports(reports); } catch { /* non-fatal */ }
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

  const handleCancelAssignment = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/unassign-engineer`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to cancel assignment"); }
      else await fetchData();
    } catch { setError("Network error"); }
  };

  const handleAddEngineer = async () => {
    if (!newEng.firstName.trim() || !newEng.email.trim()) {
      setError("Name and email are required");
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
          whatsappNumber: newEng.whatsappNumber.trim() || undefined,
          pincodeIds: newEng.pincodeIds,
        }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to add engineer"); }
      else {
        const data = await res.json();
        setShowAddEngineer(false);
        setEngineerCreated({
          name: newEng.firstName.trim(),
          email: newEng.email.trim(),
          setPasswordUrl: data.setPasswordUrl,
          hasWhatsapp: !!newEng.whatsappNumber.trim(),
        });
        setNewEng({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] });
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

  // ── Filter dropdown options (derived from tickets) ──
  const dealerOptions = useMemo(() => {
    const names = tickets
      .map(t => t.dealer ? `${t.dealer.firstName}${t.dealer.lastName ? " " + t.dealer.lastName : ""}`.trim() : null)
      .filter((v): v is string => !!v);
    return Array.from(new Set(names)).sort();
  }, [tickets]);

  const modelOptions = useMemo(() => {
    const models = tickets
      .map(t => t.machineName || t.machineProductCode || null)
      .filter((v): v is string => !!v);
    return Array.from(new Set(models)).sort();
  }, [tickets]);
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
    // Dealer name filter
    if (dealerFilter) {
      pool = pool.filter(t => {
        const dn = t.dealer ? `${t.dealer.firstName}${t.dealer.lastName ? " " + t.dealer.lastName : ""}`.trim() : "";
        return dn === dealerFilter;
      });
    }
    // Model of product filter
    if (modelFilter) {
      pool = pool.filter(t => (t.machineName || t.machineProductCode || "") === modelFilter);
    }
    // Complaint free-text filter
    if (complaintFilter.trim()) {
      const cf = complaintFilter.trim().toLowerCase();
      pool = pool.filter(t => t.problemDescription.toLowerCase().includes(cf));
    }
    const sortByAge = (a: ServiceTicket, b: ServiceTicket) => (b.ageHours ?? 0) - (a.ageHours ?? 0);
    const urgent = pool.filter(t => (t.ageHours ?? 0) > 6 && t.status !== "CLOSED").sort(sortByAge);
    const unassigned = pool.filter(t => t.status === "OPEN" && (t.ageHours ?? 0) <= 6).sort(sortByAge);
    const inProgress = pool.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status) && (t.ageHours ?? 0) <= 6).sort(sortByAge);
    const closed = pool.filter(t => t.status === "CLOSED").sort(sortByAge);
    return { urgent, unassigned, inProgress, closed };
  }, [tickets, archivedIds, dateRange, searchQuery, dealerFilter, modelFilter, complaintFilter]);

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
    <div className="flex h-[100dvh] bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-line-dark shrink-0">
          <Logo variant="full" size="sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-line dark:border-line-dark shrink-0">
          <div className="flex items-center gap-3">
            <Avatar name={`${user.firstName} ${user.lastName || ""}`} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content dark:text-content-dark truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">Service Manager</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <div className="pt-1 pb-1 px-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary mb-2">
              Manage
            </p>
            {([
              { key: "tickets" as PageView, label: "Tickets", icon: <Ticket className="w-3.5 h-3.5" />, count: total },
              { key: "engineers" as PageView, label: "Engineers", icon: <Users className="w-3.5 h-3.5" />, count: engineers.length },
              { key: "locations" as PageView, label: "Locations", icon: <MapPin className="w-3.5 h-3.5" />, count: myPincodes.length },
              { key: "assistants" as PageView, label: "Assistants", icon: <ShieldCheck className="w-3.5 h-3.5" />, count: assistants.length },
              { key: "dealers" as PageView, label: "Dealers", icon: <Store className="w-3.5 h-3.5" />, count: dealers.length },
              { key: "work-reports" as PageView, label: "Dealer Updates", icon: <ClipboardList className="w-3.5 h-3.5" />, count: workReports.length },
            ]).map((nav) => (
              <button
                key={nav.key}
                onClick={() => { setPageView(nav.key); if (isMobile) setSidebarOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                  pageView === nav.key
                    ? "bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 font-medium"
                    : "text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                )}
              >
                {nav.icon}
                {nav.label}
                <span className="ml-auto text-xs bg-primary/10 dark:bg-primary-400/10 text-primary dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                  {nav.count}
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className="px-4 py-3 border-t border-line dark:border-line-dark space-y-2 shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-content-secondary dark:text-content-dark-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-content-secondary dark:text-content-dark-secondary hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </ResponsiveSidebar>

      {/* ═══════════════════ CONTENT ═══════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ═══════════════════ HEADER ═══════════════════ */}
        <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-content dark:hover:text-content-dark hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Logo className="h-8 w-auto" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-content dark:text-content-dark leading-tight truncate">Service Manager</h1>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{user.firstName} {user.lastName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-2 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-content dark:hover:text-content-dark hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
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

          {/* ═══════════════════ TICKETS VIEW ═══════════════════ */}
          {pageView === "tickets" && (
            <>
              {/* ── Compact Stats + Filter Row ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-3 text-xs font-medium">
                  <span className="text-content-secondary dark:text-content-dark-secondary">Total <span className="font-bold text-content dark:text-content-dark">{total}</span></span>
                  <span className={cn("text-content-secondary dark:text-content-dark-secondary", unassigned > 0 && "text-red-600")}>Open <span className="font-bold">{unassigned}</span></span>
                  <span className="text-content-secondary dark:text-content-dark-secondary">Active <span className="font-bold text-primary">{active}</span></span>
                  <span className="text-content-secondary dark:text-content-dark-secondary">Closed <span className="font-bold text-emerald-600">{closed}</span></span>
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
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/manager/export/tickets", { credentials: "include" });
                        if (!res.ok) { setError("Export failed"); return; }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `tickets_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch { setError("Export failed"); }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-content-tertiary dark:text-content-dark-tertiary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
              </div>

              {/* ── Advanced Filters Panel ── */}
              {showFilters && (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-lg border border-line dark:border-line-dark shadow-sm p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Dealer name dropdown */}
                    <div>
                      <label className="block text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-1 uppercase tracking-wide">Dealer</label>
                      <select value={dealerFilter} onChange={e => setDealerFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md text-xs border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary">
                        <option value="">All Dealers</option>
                        {dealerOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    {/* Model of product dropdown */}
                    <div>
                      <label className="block text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-1 uppercase tracking-wide">Model</label>
                      <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md text-xs border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary">
                        <option value="">All Models</option>
                        {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    {/* Complaint free-text */}
                    <div>
                      <label className="block text-[10px] font-semibold text-content-secondary dark:text-content-dark-secondary mb-1 uppercase tracking-wide">Complaint</label>
                      <input type="text" value={complaintFilter} onChange={e => setComplaintFilter(e.target.value)}
                        placeholder="Search complaint..."
                        className="w-full px-2.5 py-1.5 rounded-md text-xs border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark placeholder:text-content-tertiary dark:placeholder:text-content-dark-tertiary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary" />
                    </div>
                  </div>
                  {(dealerFilter || modelFilter || complaintFilter) && (
                    <button onClick={() => { setDealerFilter(""); setModelFilter(""); setComplaintFilter(""); }}
                      className="mt-2 text-xs text-primary hover:underline">Clear all filters</button>
                  )}
                </div>
              )}

              {/* ── Grouped Ticket Sections ── */}
              {(() => {
                const { urgent, unassigned: unassignedGroup, inProgress: inProgressGroup, closed: closedGroup } = ticketGroups;
                const totalVisible = urgent.length + unassignedGroup.length + inProgressGroup.length + closedGroup.length;

                const renderTicketCard = (ticket: ServiceTicket) => {
                  const canAssign = ticket.status === "OPEN";
                  const isArchived = archivedIds.has(ticket.id);
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

                        {/* ── Row 1: Ticket Number (bold) + Customer Name ── */}
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

                        {/* ── Row 2: Serial Number ── */}
                        {ticket.machineSerialNumber && (
                          <div className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary leading-tight">
                            <span className="shrink-0">🔢</span>
                            <span className="font-mono font-medium">S/N: {ticket.machineSerialNumber}</span>
                          </div>
                        )}

                        {/* ── Row 3: Complaint (1 line) ── */}
                        {complaintDisplay && (
                          <p className="text-sm text-content-secondary dark:text-content-dark-secondary leading-tight truncate">{complaintDisplay}</p>
                        )}

                        {/* ── Row 4: Location + Pincode · Time raised ── */}
                        <div className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary leading-tight">
                          {locationShort ? <>
                            <span className="shrink-0">📍</span>
                            <span className="truncate">{locationShort}</span>
                            {!ticket.pincode && (
                              <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20">
                                No zone
                              </span>
                            )}
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

                        {/* ── Row 5: Assign action (for OPEN tickets only) ── */}
                        <div className="flex items-center justify-end pt-1">
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {canAssign && !isArchived && (
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
                                  // Show ONLY engineers covering this ticket's zone
                                  const matched = ticketPincode
                                    ? sortedEngineers.filter(e =>
                                        e.engineerPincodes?.some(p =>
                                          p.id === ticketPincode.id || p.code === ticketPincode.code
                                        )
                                      )
                                    : []; // no pincode on ticket → show no engineers

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
                                            ⚠ No zone on ticket — set a pincode first
                                          </p>
                                        )}
                                      </div>
                                      {sortedEngineers.length === 0 ? (
                                        <p className="px-3 py-2 text-xs text-content-tertiary dark:text-content-dark-tertiary text-center">No engineers in your team</p>
                                      ) : !hasTicketPincode ? (
                                        <div className="px-3 py-3 text-center">
                                          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">No zone assigned to this ticket</p>
                                          <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Set a pincode on the ticket before assigning an engineer</p>
                                        </div>
                                      ) : noZoneEngineer ? (
                                        <div className="px-3 py-3 text-center">
                                          <p className="text-xs font-semibold text-amber-600">No engineer assigned to zone {ticketPincode!.code}</p>
                                          <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Assign a pincode to an engineer in Team tab first</p>
                                        </div>
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

                const renderGroup = (title: string, icon: string, tickets: ServiceTicket[]) => {
                  if (tickets.length === 0) return null;
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
                        <span className="text-xs font-bold text-content-tertiary dark:text-content-dark-tertiary bg-surface-secondary dark:bg-surface-dark-secondary px-1.5 py-0.5 rounded">{tickets.length}</span>
                        {isClosedGroup && (
                          <span className="ml-auto">
                            {isCollapsed ? <ChevronDown className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" /> : <ChevronUp className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" />}
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
                    <div className="bg-surface-card dark:bg-surface-dark-card rounded-lg border border-line dark:border-line-dark shadow-sm py-12 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                      <Ticket className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">{hasActiveFilters ? "No tickets match your filters" : "No tickets"}</p>
                      {hasActiveFilters && <button onClick={resetFilters} className="mt-1 text-xs text-primary hover:underline">Clear filters</button>}
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
          {pageView === "engineers" && (
            <section className="space-y-4">
              {/* Header */}
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

              {/* Engineer list */}
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
                          <p className="text-sm font-bold text-content dark:text-content-dark truncate">{eng.firstName} {eng.lastName}</p>
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
                          <button
                            onClick={() => openEditModal(eng)}
                            className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-primary hover:bg-blue-50 transition-colors"
                            title="Edit engineer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`To delete ${eng.firstName}${eng.lastName ? " " + eng.lastName : ""}, make sure all their tickets are reassigned to another engineer first.\n\nProceed with deletion?`)) return;
                              setDeletingEngineerId(eng.id);
                              try {
                                const res = await fetch(`/api/manager/engineers/${eng.id}`, { method: "DELETE", credentials: "include" });
                                if (!res.ok) {
                                  const data = await res.json();
                                  if (data.activeTickets?.length > 0) {
                                    const list = data.activeTickets
                                      .map((t: { ticketNumber: string; status: string }) => `${t.ticketNumber}`)
                                      .join(", ");
                                    setError(`To delete this engineer, please reassign their active ticket(s) to another engineer first: ${list}`);
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
            </section>
          )}

          {/* ═══════════════════ ASSISTANTS VIEW ═══════════════════ */}
          {pageView === "assistants" && (
            <section className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-content dark:text-content-dark">Assistant Managers</h2>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">{assistants.length} assistant{assistants.length !== 1 ? "s" : ""} — each manages their own pincode zones & engineers</p>
                </div>
                <button onClick={() => setShowAddAssistant(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Assistant
                </button>
              </div>

              {/* Assistants list */}
              {assistants.length === 0 ? (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                  <ShieldCheck className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No assistant managers yet</p>
                  <button onClick={() => setShowAddAssistant(true)} className="mt-2 text-xs text-primary hover:underline">Add your first assistant</button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {assistants.map(asst => (
                    <div key={asst.id} className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-content dark:text-content-dark truncate">{asst.firstName} {asst.lastName}</p>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{asst.email}</p>
                          {asst.whatsappNumber && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" /> {asst.whatsappNumber}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                            {asst._count.managedEngineers} eng
                          </span>
                          <button
                            onClick={() => {
                              setEditingAsst(asst);
                              setEditAsstPincodeState("");
                              setEditAsstForm({
                                firstName: asst.firstName,
                                lastName: asst.lastName ?? "",
                                newPassword: "",
                                whatsappNumber: asst.whatsappNumber ?? "",
                                pincodeIds: asst.engineerPincodes.map(p => p.id),
                              });
                            }}
                            className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-primary hover:bg-blue-50 transition-colors"
                            title="Edit assistant"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete ${asst.firstName}${asst.lastName ? " " + asst.lastName : ""}? Their engineers will be reassigned to you.`)) return;
                              setDeletingAsstId(asst.id);
                              try {
                                const res = await fetch(`/api/manager/assistants/${asst.id}`, { method: "DELETE", credentials: "include" });
                                if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to delete"); }
                                else { await fetchData(); }
                              } catch { setError("Network error"); }
                              finally { setDeletingAsstId(null); }
                            }}
                            disabled={deletingAsstId === asst.id}
                            className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete assistant"
                          >
                            {deletingAsstId === asst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      {/* Assigned pincodes */}
                      {asst.engineerPincodes.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {asst.engineerPincodes.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                              <MapPin className="w-2.5 h-2.5" /> {[p.place, p.district].filter(Boolean).join(", ") || p.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">No pincodes assigned — assistant sees no tickets yet</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Add Assistant Modal ── */}
              {showAddAssistant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-content dark:text-content-dark">Add Assistant Manager</h3>
                      <button onClick={() => { setShowAddAssistant(false); setNewAsstPincodeState(""); }} className="p-1.5 rounded-lg hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                        <input value={newAsst.firstName} onChange={e => setNewAsst(f => ({ ...f, firstName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                        <input value={newAsst.lastName} onChange={e => setNewAsst(f => ({ ...f, lastName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Email *</label>
                      <input type="email" value={newAsst.email} onChange={e => setNewAsst(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                      <input type="tel" value={newAsst.whatsappNumber} onChange={e => setNewAsst(f => ({ ...f, whatsappNumber: e.target.value }))}
                        placeholder="e.g. 919876543210"
                        className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    {myPincodes.length > 0 && (() => {
                      const asstStates = Array.from(new Set(myPincodes.map(p => p.state).filter((s): s is string => !!s))).sort();
                      const filteredPincodes = newAsstPincodeState
                        ? myPincodes.filter(p => p.state === newAsstPincodeState)
                        : [];
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Assign Pincodes</label>
                            {newAsst.pincodeIds.length > 0 && (
                              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {newAsst.pincodeIds.length} selected
                              </span>
                            )}
                          </div>
                          {/* Step 1 — State dropdown */}
                          <select
                            value={newAsstPincodeState}
                            onChange={e => setNewAsstPincodeState(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                            <option value="">Select a state…</option>
                            {asstStates.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          {/* Step 2 — Pincodes for selected state */}
                          {newAsstPincodeState && (
                            <div className="rounded-lg border border-line dark:border-line-dark overflow-hidden">
                              <div className="px-3 py-1.5 bg-surface-secondary dark:bg-surface-dark-secondary border-b border-line dark:border-line-dark flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">{newAsstPincodeState}</span>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => setNewAsst(f => ({
                                    ...f,
                                    pincodeIds: [...new Set([...f.pincodeIds, ...filteredPincodes.map(p => p.id)])],
                                  }))} className="text-[11px] text-primary hover:underline">All</button>
                                  <button type="button" onClick={() => setNewAsst(f => ({
                                    ...f,
                                    pincodeIds: f.pincodeIds.filter(id => !filteredPincodes.some(p => p.id === id)),
                                  }))} className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary hover:underline">None</button>
                                </div>
                              </div>
                              <div className="p-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                {filteredPincodes.map(p => (
                                  <button key={p.id} type="button"
                                    onClick={() => setNewAsst(f => ({
                                      ...f,
                                      pincodeIds: f.pincodeIds.includes(p.id)
                                        ? f.pincodeIds.filter(id => id !== p.id)
                                        : [...f.pincodeIds, p.id],
                                    }))}
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                      newAsst.pincodeIds.includes(p.id)
                                        ? "bg-primary text-white border-primary"
                                        : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary"
                                    )}>
                                    {p.code}{p.place ? ` · ${p.place}` : ""}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Summary of all selected pincodes across states */}
                          {newAsst.pincodeIds.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {myPincodes.filter(p => newAsst.pincodeIds.includes(p.id)).map(p => (
                                <span key={p.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                                  {p.code}{p.place ? ` · ${p.place}` : ""}
                                  <button type="button" onClick={() => setNewAsst(f => ({ ...f, pincodeIds: f.pincodeIds.filter(id => id !== p.id) }))}
                                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-primary/20">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setShowAddAssistant(false); setNewAsstPincodeState(""); }}
                        className="flex-1 px-4 py-2 rounded-lg text-sm border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                        Cancel
                      </button>
                      <button
                        disabled={addingAssistant}
                        onClick={async () => {
                          if (!newAsst.firstName.trim() || !newAsst.email.trim()) { setError("Name and email are required"); return; }
                          setAddingAssistant(true);
                          try {
                            const res = await fetch("/api/manager/assistants", {
                              method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                              body: JSON.stringify({
                                firstName: newAsst.firstName.trim(),
                                lastName: newAsst.lastName.trim() || undefined,
                                email: newAsst.email.trim(),
                                whatsappNumber: newAsst.whatsappNumber.trim() || undefined,
                              }),
                            });
                            if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to add"); }
                            else {
                              const data = await res.json();
                              // Assign pincodes if any selected
                              if (newAsst.pincodeIds.length > 0) {
                                await fetch(`/api/manager/assistants/${data.assistant.id}/pincodes`, {
                                  method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                                  body: JSON.stringify({ pincodeIds: newAsst.pincodeIds }),
                                });
                              }
                              setShowAddAssistant(false);
                              setNewAsstPincodeState("");
                              setAssistantCreated({ name: newAsst.firstName.trim(), email: newAsst.email.trim(), setPasswordUrl: data.setPasswordUrl, hasWhatsapp: !!newAsst.whatsappNumber.trim() });
                              setNewAsst({ firstName: "", lastName: "", email: "", whatsappNumber: "", pincodeIds: [] });
                              await fetchData();
                            }
                          } catch { setError("Network error"); }
                          finally { setAddingAssistant(false); }
                        }}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                        {addingAssistant ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create Assistant"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Assistant Created Banner ── */}
              {assistantCreated && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-content dark:text-content-dark">Assistant Created!</h3>
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{assistantCreated.name} — {assistantCreated.email}</p>
                      </div>
                    </div>
                    {assistantCreated.hasWhatsapp ? (
                      <p className="text-sm text-content-secondary dark:text-content-dark-secondary">A set-password link was sent via WhatsApp.</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Share this set-password link with the assistant:</p>
                        <div className="flex items-center gap-2 bg-surface dark:bg-surface-dark rounded-lg px-3 py-2 border border-line dark:border-line-dark">
                          <span className="text-xs font-mono text-content dark:text-content-dark truncate flex-1">{assistantCreated.setPasswordUrl}</span>
                          <button onClick={() => navigator.clipboard?.writeText(assistantCreated.setPasswordUrl)} className="shrink-0 p-1 rounded hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary text-content-secondary dark:text-content-dark-secondary" title="Copy">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setAssistantCreated(null)} className="w-full px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors">Done</button>
                  </div>
                </div>
              )}

              {/* ── Edit Assistant Modal ── */}
              {editingAsst && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-content dark:text-content-dark">Edit Assistant Manager</h3>
                      <button onClick={() => { setEditingAsst(null); setEditAsstPincodeState(""); }} className="p-1.5 rounded-lg hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                        <input value={editAsstForm.firstName} onChange={e => setEditAsstForm(f => ({ ...f, firstName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                        <input value={editAsstForm.lastName} onChange={e => setEditAsstForm(f => ({ ...f, lastName: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                      <input type="tel" value={editAsstForm.whatsappNumber} onChange={e => setEditAsstForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">New Password <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">(leave blank to keep current)</span></label>
                      <input type="password" value={editAsstForm.newPassword} onChange={e => setEditAsstForm(f => ({ ...f, newPassword: e.target.value }))}
                        placeholder="Min 8 characters"
                        className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    </div>
                    {myPincodes.length > 0 && (() => {
                      const asstStates = Array.from(new Set(myPincodes.map(p => p.state).filter((s): s is string => !!s))).sort();
                      const filteredPincodes = editAsstPincodeState
                        ? myPincodes.filter(p => p.state === editAsstPincodeState)
                        : [];
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Assigned Pincodes</label>
                            {editAsstForm.pincodeIds.length > 0 && (
                              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {editAsstForm.pincodeIds.length} selected
                              </span>
                            )}
                          </div>
                          {/* Step 1 — State dropdown */}
                          <select
                            value={editAsstPincodeState}
                            onChange={e => setEditAsstPincodeState(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                            <option value="">Select a state…</option>
                            {asstStates.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          {/* Step 2 — Pincodes for selected state */}
                          {editAsstPincodeState && (
                            <div className="rounded-lg border border-line dark:border-line-dark overflow-hidden">
                              <div className="px-3 py-1.5 bg-surface-secondary dark:bg-surface-dark-secondary border-b border-line dark:border-line-dark flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">{editAsstPincodeState}</span>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => setEditAsstForm(f => ({
                                    ...f,
                                    pincodeIds: [...new Set([...f.pincodeIds, ...filteredPincodes.map(p => p.id)])],
                                  }))} className="text-[11px] text-primary hover:underline">All</button>
                                  <button type="button" onClick={() => setEditAsstForm(f => ({
                                    ...f,
                                    pincodeIds: f.pincodeIds.filter(id => !filteredPincodes.some(p => p.id === id)),
                                  }))} className="text-[11px] text-content-tertiary dark:text-content-dark-tertiary hover:underline">None</button>
                                </div>
                              </div>
                              <div className="p-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                {filteredPincodes.map(p => (
                                  <button key={p.id} type="button"
                                    onClick={() => setEditAsstForm(f => ({
                                      ...f,
                                      pincodeIds: f.pincodeIds.includes(p.id)
                                        ? f.pincodeIds.filter(id => id !== p.id)
                                        : [...f.pincodeIds, p.id],
                                    }))}
                                    className={cn(
                                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                      editAsstForm.pincodeIds.includes(p.id)
                                        ? "bg-primary text-white border-primary"
                                        : "border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary"
                                    )}>
                                    {p.code}{p.place ? ` · ${p.place}` : ""}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Summary of all selected pincodes across states */}
                          {editAsstForm.pincodeIds.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {myPincodes.filter(p => editAsstForm.pincodeIds.includes(p.id)).map(p => (
                                <span key={p.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                                  {p.code}{p.place ? ` · ${p.place}` : ""}
                                  <button type="button" onClick={() => setEditAsstForm(f => ({ ...f, pincodeIds: f.pincodeIds.filter(id => id !== p.id) }))}
                                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-primary/20">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setEditingAsst(null); setEditAsstPincodeState(""); }}
                        className="flex-1 px-4 py-2 rounded-lg text-sm border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                        Cancel
                      </button>
                      <button
                        disabled={savingAsstEdit}
                        onClick={async () => {
                          if (!editAsstForm.firstName.trim()) { setError("First name is required"); return; }
                          setSavingAsstEdit(true);
                          try {
                            const body: Record<string, string | undefined> = {};
                            if (editAsstForm.firstName.trim() !== editingAsst.firstName) body.firstName = editAsstForm.firstName.trim();
                            if (editAsstForm.lastName.trim() !== (editingAsst.lastName ?? "")) body.lastName = editAsstForm.lastName.trim();
                            if (editAsstForm.whatsappNumber.trim() !== (editingAsst.whatsappNumber ?? "")) body.whatsappNumber = editAsstForm.whatsappNumber.trim();
                            if (editAsstForm.newPassword.trim()) {
                              if (editAsstForm.newPassword.length < 8) { setError("Password must be at least 8 characters"); setSavingAsstEdit(false); return; }
                              body.newPassword = editAsstForm.newPassword;
                            }
                            if (Object.keys(body).length > 0) {
                              const res = await fetch(`/api/manager/assistants/${editingAsst.id}`, {
                                method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                                body: JSON.stringify(body),
                              });
                              if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to update"); setSavingAsstEdit(false); return; }
                            }
                            // Sync pincodes
                            await fetch(`/api/manager/assistants/${editingAsst.id}/pincodes`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                              body: JSON.stringify({ pincodeIds: editAsstForm.pincodeIds }),
                            });
                            setEditingAsst(null);
                            setEditAsstPincodeState("");
                            await fetchData();
                          } catch { setError("Network error"); }
                          finally { setSavingAsstEdit(false); }
                        }}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                        {savingAsstEdit ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Changes"}
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
                <h2 className="text-lg font-bold text-content dark:text-content-dark">Locations</h2>
                <p className="text-sm text-content-secondary dark:text-content-dark-secondary">Manage your service zones — {myPincodes.length} pincode{myPincodes.length !== 1 ? "s" : ""}</p>
              </div>

              {/* Add service zones card */}
              <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-4 space-y-4">
                {/* Header + mode toggle */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider">Add Service Zones</p>
                  <div className="flex rounded-lg border border-line dark:border-line-dark overflow-hidden text-xs">
                    <button type="button"
                      onClick={() => setLocMode("browse")}
                      className={cn("px-3 py-1.5 font-semibold transition-colors",
                        locMode === "browse" ? "bg-primary text-white" : "bg-surface-card dark:bg-surface-dark-card text-content-secondary dark:text-content-dark-secondary hover:bg-surface dark:hover:bg-surface-dark")}>
                      Browse
                    </button>
                    <button type="button"
                      onClick={() => { setLocMode("custom"); setCustomError(""); }}
                      className={cn("px-3 py-1.5 font-semibold transition-colors border-l border-line dark:border-line-dark",
                        locMode === "custom" ? "bg-primary text-white" : "bg-surface-card dark:bg-surface-dark-card text-content-secondary dark:text-content-dark-secondary hover:bg-surface dark:hover:bg-surface-dark")}>
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
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Pincode *</label>
                        <div className="relative">
                          <input type="text" inputMode="numeric" maxLength={6}
                            placeholder="e.g. 600001"
                            value={customForm.code}
                            onChange={e => setCustomForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                            className={cn(
                              "w-full px-3 py-2 rounded-lg text-sm border bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2",
                              isDuplicate
                                ? "border-amber-400 focus:ring-amber-200 focus:border-amber-400"
                                : "border-line dark:border-line-dark focus:ring-primary/20 focus:border-primary"
                            )} />
                          {customValidating && !isDuplicate && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                          )}
                          {isDuplicate && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
                              Already added
                            </span>
                          )}
                        </div>
                        {customValidating && !isDuplicate && <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary mt-1">Looking up pincode…</p>}
                        {isDuplicate && (
                          <p className="text-xs text-amber-600 mt-1">
                            {trimmedCode} is already in your service zones.
                          </p>
                        )}
                      </div>
                      {/* Place */}
                      <div>
                        <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Place / Area *</label>
                        <input type="text" placeholder="e.g. Adyar"
                          value={customForm.place}
                          onChange={e => setCustomForm(f => ({ ...f, place: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                      </div>
                      {/* District + State side-by-side */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">District *</label>
                          <input type="text" placeholder="e.g. Chennai"
                            value={customForm.district}
                            onChange={e => setCustomForm(f => ({ ...f, district: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">State *</label>
                          <input type="text" placeholder="e.g. Tamil Nadu"
                            value={customForm.state}
                            onChange={e => setCustomForm(f => ({ ...f, state: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        </div>
                      </div>
                      {customError && <p className="text-xs text-red-500">{customError}</p>}
                      <button onClick={handleSaveCustom} disabled={savingCustom || isDuplicate}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
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
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">State</label>
                  <select
                    value={locState}
                    onChange={e => { setLocState(e.target.value); setLocDistrict(""); setLocSelected([]); }}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">Select state…</option>
                    {getStates().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Step 2 — District */}
                {locState && (
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">District</label>
                    <select
                      value={locDistrict}
                      onChange={e => { setLocDistrict(e.target.value); setLocSelected([]); }}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
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
                      <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-2">Pincodes</label>
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
                                    ? "border-primary bg-blue-50 text-primary font-semibold"
                                    : "border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content-secondary dark:text-content-dark-secondary hover:border-primary/40 hover:bg-blue-50/50"
                              )}>
                              <span className="font-mono font-bold shrink-0">{p.code}</span>
                              <span className="truncate text-content-tertiary dark:text-content-dark-tertiary">{p.name}</span>
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
                    <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">{locSelected.length} selected</p>
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
                  {savingLocations ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save {locSelected.length > 0 ? `${locSelected.length} ` : ""}Zone{locSelected.length !== 1 ? "s" : ""}
                </button>
                </>}
              </div>

              {/* Pincode list */}
              {myPincodes.length === 0 ? (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                  <MapPin className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No locations yet</p>
                  <p className="text-xs mt-1">Add your first service zone above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myPincodes.map(p => {
                    const isEditing = editingPincode?.id === p.id;
                    return (
                      <div key={p.id} className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-3.5 space-y-3">
                        {!isEditing ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-primary border border-blue-200">
                                {p.code}
                              </span>
                              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{[p.place, p.district, p.state].filter(Boolean).join(", ") || "—"}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEditPincode(p)}
                                className="p-2 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-primary hover:bg-blue-50 transition-colors" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeletePincode(p.id)} disabled={deletingPincodeId === p.id}
                                className="p-2 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
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
                                className="px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                              <input type="text" placeholder="Place"
                                value={editPincodeForm.place}
                                onChange={e => setEditPincodeForm(f => ({ ...f, place: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                              <input type="text" placeholder="District"
                                value={editPincodeForm.district}
                                onChange={e => setEditPincodeForm(f => ({ ...f, district: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                              <input type="text" placeholder="State"
                                value={editPincodeForm.state}
                                onChange={e => setEditPincodeForm(f => ({ ...f, state: e.target.value }))}
                                className="px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={handleSavePincodeEdit} disabled={savingPincodeEdit}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                                {savingPincodeEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                              </button>
                              <button onClick={() => setEditingPincode(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
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

          {/* ═══════════════════ DEALERS VIEW ═══════════════════ */}
          {pageView === "dealers" && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-content dark:text-content-dark">Dealers</h2>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">{dealers.length} dealer{dealers.length !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={() => setShowAddDealer(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Dealer
                </button>
              </div>

              {dealers.length === 0 ? (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                  <Store className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No dealers yet</p>
                  <button onClick={() => setShowAddDealer(true)} className="mt-2 text-xs text-primary hover:underline">Add your first dealer</button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {dealers.map(dlr => (
                    <div key={dlr.id} className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm p-4 space-y-2 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-content dark:text-content-dark truncate">{dlr.firstName} {dlr.lastName}</p>
                          <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">{dlr.email}</p>
                          {dlr.pincode?.place && (
                            <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary truncate mt-0.5">
                              {dlr.pincode.place}{dlr.pincode.state ? `, ${dlr.pincode.state}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {dlr.pincode && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                              {dlr.pincode.code}
                            </span>
                          )}
                          {dlr.warrantyMonths && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                              {dlr.warrantyMonths}m warranty
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-surface-secondary dark:bg-surface-dark-secondary text-content-secondary dark:text-content-dark-secondary">
                            {dlr.ticketCount ?? 0} tickets
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
                          Added {formatRelativeTime(new Date(dlr.createdAt))}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingDealer(dlr);
                              setEditDealerForm({
                                firstName: dlr.firstName,
                                lastName: dlr.lastName ?? "",
                                newPassword: "",
                                warrantyMonths: dlr.warrantyMonths != null ? String(dlr.warrantyMonths) : "",
                                pincode: dlr.pincode?.code ?? "",
                              });
                            }}
                            className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-primary hover:bg-blue-50 transition-colors"
                            title="Edit dealer">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              setDeletingDealerId(dlr.id);
                              try {
                                const res = await fetch(`/api/manager/dealers/${dlr.id}`, { method: "DELETE", credentials: "include" });
                                if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to delete dealer"); }
                                else { await fetchData(); }
                              } catch { setError("Network error"); }
                              finally { setDeletingDealerId(null); }
                            }}
                            disabled={deletingDealerId === dlr.id}
                            className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete dealer">
                            {deletingDealerId === dlr.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ═══════════════════ WORK REPORTS VIEW ═══════════════════ */}
          {pageView === "work-reports" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-content dark:text-content-dark">Dealer Service Updates</h2>
                <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                  Service &amp; replacement reports submitted by dealers on behalf of their engineers — {workReports.length} report{workReports.length !== 1 ? "s" : ""}
                </p>
              </div>

              {workReports.length === 0 ? (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                  <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No work reports yet</p>
                  <p className="text-xs mt-1">Reports appear when dealers document their service visits</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line dark:border-line-dark shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-secondary dark:bg-surface-dark-secondary">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Dealer</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Ticket #</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Machine</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Complaint</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Date</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Parts</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Warranty</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-line-dark bg-surface-card dark:bg-surface-dark-card">
                      {workReports.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                          <td className="px-4 py-3 font-medium text-content dark:text-content-dark">
                            {r.dealer ? `${r.dealer.firstName}${r.dealer.lastName ? " " + r.dealer.lastName : ""}` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-primary dark:text-primary-300">
                            {r.ticket?.ticketNumber ? `#${r.ticket.ticketNumber}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary">
                            {r.ticket?.machineName ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary max-w-[200px]">
                            <span className="line-clamp-2 text-xs leading-relaxed">
                              {r.ticket?.issueDescription ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary">
                            {new Date(r.updatedAt).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full font-semibold",
                              (r._count?.parts ?? 0) > 0
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : "text-content-tertiary dark:text-content-dark-tertiary"
                            )}>
                              {r._count?.parts ?? 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.warrantyClaimRequested ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <ShieldCheck className="w-3.5 h-3.5" /> Yes
                              </span>
                            ) : (
                              <span className="text-content-tertiary dark:text-content-dark-tertiary">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedReport(r)}
                              className="px-3 py-1 rounded-lg bg-primary/10 text-primary dark:bg-primary-400/10 dark:text-primary-300 hover:bg-primary/20 transition-colors font-medium"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

        </div>
      </main>
      </div>

      {/* ═══════════════════ ENGINEER CREATED — ONBOARDING LINK ═══════════════════ */}
      {engineerCreated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-surface-dark-card rounded-2xl shadow-2xl w-full max-w-md border border-line dark:border-line-dark overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h3 className="text-sm font-bold text-green-800 dark:text-green-300">Engineer Added Successfully</h3>
              </div>
              <button onClick={() => setEngineerCreated(null)} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                <span className="font-semibold text-content dark:text-content-dark">{engineerCreated.name}</span> has been added.
                {engineerCreated.hasWhatsapp
                  ? " A WhatsApp greeting was attempted — but if delivery failed (new number), share the link below directly."
                  : " No WhatsApp number was provided. Share this set-password link directly."
                }
              </p>

              {/* Link box */}
              <div>
                <p className="text-xs font-semibold text-content-tertiary dark:text-content-dark-tertiary mb-1.5">Set-Password Link <span className="font-normal">(expires in 7 days)</span></p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark">
                  <span className="text-xs text-content-secondary dark:text-content-dark-secondary flex-1 break-all select-all">{engineerCreated.setPasswordUrl}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(engineerCreated!.setPasswordUrl); }}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all">
                    Copy
                  </button>
                </div>
              </div>

              {/* Email reminder */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Login email: <span className="font-semibold">{engineerCreated.email}</span>. Send this link + email to the engineer via SMS, WhatsApp, or any other channel.
                </p>
              </div>

              <button
                onClick={() => setEngineerCreated(null)}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ ADD ENGINEER MODAL ═══════════════════ */}
      {showAddEngineer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md border border-line dark:border-line-dark flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark shrink-0">
              <h3 className="text-base font-bold text-content dark:text-content-dark">Add Engineer</h3>
              <button onClick={() => setShowAddEngineer(false)} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                  <input type="text" value={newEng.firstName} onChange={e => setNewEng(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Arun" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input type="text" value={newEng.lastName} onChange={e => setNewEng(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Kumar" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Email / Phone *</label>
                <input type="text" value={newEng.email} onChange={e => setNewEng(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="arun@example.com" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary dark:text-content-dark-tertiary" />
                  <input type="text" value={newEng.whatsappNumber} onChange={e => setNewEng(p => ({ ...p, whatsappNumber: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="91XXXXXXXXXX" />
                </div>
                <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">International format — greeting will be sent on registration</p>
              </div>

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                🔗 A set-password link will be sent to the engineer via WhatsApp after registration.
              </div>

              {myPincodes.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-2">
                    Assign Pincodes * <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">({newEng.pincodeIds.length} selected)</span>
                  </label>
                  <div className="space-y-1.5">
                    {Object.entries(
                      myPincodes.reduce<Record<string, PincodeInfo[]>>((acc, p) => {
                        const s = p.state || "Other"; acc[s] = [...(acc[s] || []), p]; return acc;
                      }, {})
                    ).sort(([a], [b]) => a.localeCompare(b)).map(([stateName, pins]) => {
                      const isOpen = expandedStates.has("add:" + stateName);
                      const selCount = pins.filter(p => newEng.pincodeIds.includes(p.id)).length;
                      return (
                        <div key={stateName} className="border border-line dark:border-line-dark rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-surface dark:bg-surface-dark">
                            <button type="button"
                              onClick={() => setExpandedStates(prev => { const s = new Set(Array.from(prev)); if (s.has("add:" + stateName)) { s.delete("add:" + stateName); } else { s.add("add:" + stateName); } return s; })}
                              className="flex items-center gap-1.5 flex-1 text-left min-w-0">
                              <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 text-content-tertiary dark:text-content-dark-tertiary transition-transform", isOpen && "rotate-180")} />
                              <span className="text-xs font-semibold text-content dark:text-content-dark truncate">{stateName}</span>
                              <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary shrink-0">
                                {selCount > 0 ? `${selCount}/${pins.length} selected` : `${pins.length}`}
                              </span>
                            </button>
                            {selCount < pins.length ? (
                              <button type="button"
                                onClick={() => setNewEng(prev => ({ ...prev, pincodeIds: Array.from(new Set([...prev.pincodeIds, ...pins.map(p => p.id)])) }))}
                                className="ml-2 shrink-0 text-[10px] text-primary hover:text-primary-hover font-medium transition-colors">All</button>
                            ) : (
                              <button type="button"
                                onClick={() => setNewEng(prev => ({ ...prev, pincodeIds: prev.pincodeIds.filter(id => !pins.some(p => p.id === id)) }))}
                                className="ml-2 shrink-0 text-[10px] text-rose-500 hover:text-rose-600 font-medium transition-colors">Clear</button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="flex flex-wrap gap-1.5 p-2.5 border-t border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                              {pins.map(p => {
                                const selected = newEng.pincodeIds.includes(p.id);
                                return (
                                  <button key={p.id} type="button"
                                    onClick={() => setNewEng(prev => {
                                      const isSel = prev.pincodeIds.includes(p.id);
                                      return { ...prev, pincodeIds: isSel ? prev.pincodeIds.filter(x => x !== p.id) : [...prev.pincodeIds, p.id] };
                                    })}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                                      selected
                                        ? "bg-primary text-white border-primary"
                                        : "bg-surface-card dark:bg-surface-dark-card text-content-secondary dark:text-content-dark-secondary border-line dark:border-line-dark hover:border-primary hover:text-primary"
                                    )}>
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[140px]">{[p.place, p.district].filter(Boolean).join(", ") || p.code}</span>
                                    <span className="shrink-0 opacity-60">— {p.code}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark rounded-b-2xl shrink-0">
              <button onClick={() => setShowAddEngineer(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleAddEngineer} disabled={addingEngineer}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
                {addingEngineer && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Engineer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {dropdownOpen && <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(null)} />}

      {/* ═══════════════════ TICKET DECISION PANEL ═══════════════════ */}
      {drawerTicket && (
        <TicketDrawer
          ticket={drawerTicket}
          engineers={sortedEngineers}
          isArchived={archivedIds.has(drawerTicket.id)}
          assigningId={assigningId}
          onClose={() => { setDrawerTicket(null); setDrawerReassign(false); setDrawerConfirmEng(null); }}
          onAssignEngineer={handleAssignEngineer}
          onCancelAssignment={handleCancelAssignment}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
        />
      )}

      {/* ═══════════════════ EDIT ENGINEER MODAL ═══════════════════ */}
      {editingEng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md border border-line dark:border-line-dark flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark shrink-0">
              <div>
                <h3 className="text-base font-bold text-content dark:text-content-dark">Edit Engineer</h3>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{editingEng.email}</p>
              </div>
              <button onClick={closeEditModal} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                  <input type="text" value={editForm.firstName} onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input type="text" value={editForm.lastName} onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>

              {/* New password (optional) */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">New Password <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">(leave blank to keep current)</span></label>
                <input type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Min 8 characters" />
              </div>

              {/* WhatsApp Number */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary dark:text-content-dark-tertiary" />
                  <input type="text" value={editForm.whatsappNumber} onChange={e => setEditForm(p => ({ ...p, whatsappNumber: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="91XXXXXXXXXX" />
                </div>
              </div>

              {/* Pincode multi-select — only manager's own pincodes */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">
                  Assigned Pincodes <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">({editForm.pincodeIds.length} selected)</span>
                </label>
                {myPincodes.length === 0 ? (
                  <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary italic py-2">You have no pincodes assigned yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(
                      myPincodes.reduce<Record<string, PincodeInfo[]>>((acc, p) => {
                        const s = p.state || "Other"; acc[s] = [...(acc[s] || []), p]; return acc;
                      }, {})
                    ).sort(([a], [b]) => a.localeCompare(b)).map(([stateName, pins]) => {
                      const isOpen = expandedStates.has("edit:" + stateName);
                      const selCount = pins.filter(p => editForm.pincodeIds.includes(p.id)).length;
                      return (
                        <div key={stateName} className="border border-line dark:border-line-dark rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-surface dark:bg-surface-dark">
                            <button type="button"
                              onClick={() => setExpandedStates(prev => { const s = new Set(Array.from(prev)); if (s.has("edit:" + stateName)) { s.delete("edit:" + stateName); } else { s.add("edit:" + stateName); } return s; })}
                              className="flex items-center gap-1.5 flex-1 text-left min-w-0">
                              <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 text-content-tertiary dark:text-content-dark-tertiary transition-transform", isOpen && "rotate-180")} />
                              <span className="text-xs font-semibold text-content dark:text-content-dark truncate">{stateName}</span>
                              <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary shrink-0">
                                {selCount > 0 ? `${selCount}/${pins.length} selected` : `${pins.length}`}
                              </span>
                            </button>
                            {selCount < pins.length ? (
                              <button type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, pincodeIds: Array.from(new Set([...prev.pincodeIds, ...pins.map(p => p.id)])) }))}
                                className="ml-2 shrink-0 text-[10px] text-primary hover:text-primary-hover font-medium transition-colors">All</button>
                            ) : (
                              <button type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, pincodeIds: prev.pincodeIds.filter(id => !pins.some(p => p.id === id)) }))}
                                className="ml-2 shrink-0 text-[10px] text-rose-500 hover:text-rose-600 font-medium transition-colors">Clear</button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="flex flex-wrap gap-1.5 p-2.5 border-t border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
                              {pins.map(p => {
                                const selected = editForm.pincodeIds.includes(p.id);
                                return (
                                  <button key={p.id} type="button"
                                    onClick={() => setEditForm(prev => {
                                      const isSel = prev.pincodeIds.includes(p.id);
                                      return { ...prev, pincodeIds: isSel ? prev.pincodeIds.filter(x => x !== p.id) : [...prev.pincodeIds, p.id] };
                                    })}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                                      selected
                                        ? "bg-primary text-white border-primary"
                                        : "bg-surface-card dark:bg-surface-dark-card text-content-secondary dark:text-content-dark-secondary border-line dark:border-line-dark hover:border-primary hover:text-primary"
                                    )}>
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[140px]">{[p.place, p.district].filter(Boolean).join(", ") || p.code}</span>
                                    <span className="shrink-0 opacity-60">— {p.code}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark rounded-b-2xl">
              <button onClick={closeEditModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ ADD DEALER MODAL ═══════════════════ */}
      {showAddDealer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md border border-line dark:border-line-dark">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <h3 className="text-base font-bold text-content dark:text-content-dark">Add Dealer</h3>
              <button onClick={() => setShowAddDealer(false)} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                  <input type="text" value={newDealer.firstName} onChange={e => setNewDealer(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Rajan" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input type="text" value={newDealer.lastName} onChange={e => setNewDealer(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Kumar" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Email *</label>
                <input type="email" value={newDealer.email} onChange={e => setNewDealer(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="dealer@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Password *</label>
                <input type="password" value={newDealer.password} onChange={e => setNewDealer(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Warranty Period</label>
                <select value={newDealer.warrantyMonths} onChange={e => setNewDealer(p => ({ ...p, warrantyMonths: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                  <option value="">Select warranty months…</option>
                  {[6, 12, 13, 15, 18, 24, 36].map(m => (
                    <option key={m} value={String(m)}>{m} months</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Pincode</label>
                <input type="text" value={newDealer.pincode} onChange={e => setNewDealer(p => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. 560001" maxLength={6} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark rounded-b-2xl">
              <button onClick={() => setShowAddDealer(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                Cancel
              </button>
              <button
                disabled={addingDealer}
                onClick={async () => {
                  if (!newDealer.firstName.trim() || !newDealer.email.trim() || !newDealer.password.trim()) {
                    setError("Name, email, and password are required"); return;
                  }
                  setAddingDealer(true);
                  try {
                    const res = await fetch("/api/manager/dealers", {
                      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                      body: JSON.stringify({
                        firstName: newDealer.firstName.trim(),
                        lastName: newDealer.lastName.trim() || undefined,
                        email: newDealer.email.trim(),
                        password: newDealer.password,
                        warrantyMonths: newDealer.warrantyMonths ? Number(newDealer.warrantyMonths) : undefined,
                        pincode: newDealer.pincode.trim() || undefined,
                      }),
                    });
                    if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to add dealer"); }
                    else {
                      setShowAddDealer(false);
                      setNewDealer({ firstName: "", lastName: "", email: "", password: "", warrantyMonths: "", pincode: "" });
                      await fetchData();
                    }
                  } catch { setError("Network error"); }
                  finally { setAddingDealer(false); }
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
                {addingDealer && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Dealer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ EDIT DEALER MODAL ═══════════════════ */}
      {editingDealer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md border border-line dark:border-line-dark">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div>
                <h3 className="text-base font-bold text-content dark:text-content-dark">Edit Dealer</h3>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{editingDealer.email}</p>
              </div>
              <button onClick={() => setEditingDealer(null)} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">First Name *</label>
                  <input type="text" value={editDealerForm.firstName} onChange={e => setEditDealerForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Last Name</label>
                  <input type="text" value={editDealerForm.lastName} onChange={e => setEditDealerForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">New Password <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">(leave blank to keep)</span></label>
                <input type="password" value={editDealerForm.newPassword} onChange={e => setEditDealerForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Warranty Period</label>
                <select value={editDealerForm.warrantyMonths} onChange={e => setEditDealerForm(p => ({ ...p, warrantyMonths: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                  <option value="">No warranty</option>
                  {[6, 12, 13, 15, 18, 24, 36].map(m => (
                    <option key={m} value={String(m)}>{m} months</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Pincode</label>
                <input type="text" value={editDealerForm.pincode} onChange={e => setEditDealerForm(p => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. 560001" maxLength={6} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark rounded-b-2xl">
              <button onClick={() => setEditingDealer(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                Cancel
              </button>
              <button
                disabled={savingDealerEdit}
                onClick={async () => {
                  if (!editingDealer || !editDealerForm.firstName.trim()) { setError("First name is required"); return; }
                  setSavingDealerEdit(true);
                  try {
                    const body: Record<string, unknown> = {};
                    if (editDealerForm.firstName.trim() !== editingDealer.firstName) body.firstName = editDealerForm.firstName.trim();
                    if (editDealerForm.lastName.trim() !== (editingDealer.lastName ?? "")) body.lastName = editDealerForm.lastName.trim();
                    if (editDealerForm.newPassword.trim()) body.newPassword = editDealerForm.newPassword;
                    const wm = editDealerForm.warrantyMonths ? Number(editDealerForm.warrantyMonths) : null;
                    if (wm !== (editingDealer.warrantyMonths ?? null)) body.warrantyMonths = wm;
                    const pc = editDealerForm.pincode.trim();
                    if (pc !== (editingDealer.pincode?.code ?? "")) body.pincode = pc || null;
                    if (Object.keys(body).length > 0) {
                      const res = await fetch(`/api/manager/dealers/${editingDealer.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
                        body: JSON.stringify(body),
                      });
                      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to update dealer"); setSavingDealerEdit(false); return; }
                    }
                    setEditingDealer(null);
                    await fetchData();
                  } catch { setError("Network error"); }
                  finally { setSavingDealerEdit(false); }
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm">
                {savingDealerEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ WORK REPORT DETAIL MODAL ═══════════════════ */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-2xl border border-line dark:border-line-dark flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark shrink-0">
              <div>
                <h3 className="text-base font-bold text-content dark:text-content-dark flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary dark:text-primary-300" />
                  Work Report
                </h3>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">
                  {selectedReport.dealer ? `${selectedReport.dealer.firstName}${selectedReport.dealer.lastName ? " " + selectedReport.dealer.lastName : ""}` : "Dealer"}
                  {selectedReport.ticket?.ticketNumber ? ` · #${selectedReport.ticket.ticketNumber}` : ""}
                  {selectedReport.ticket?.machineName ? ` · ${selectedReport.ticket.machineName}` : ""}
                </p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                <X className="w-5 h-5 text-content-secondary dark:text-content-dark-secondary" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              {/* Customer complaint (original issue) */}
              {(selectedReport.ticket?.issueDescription || selectedReport.ticket?.machineCustomer) && (
                <div className="px-3 py-3 rounded-xl bg-surface-secondary dark:bg-surface-dark-secondary border border-line dark:border-line-dark space-y-1.5">
                  {selectedReport.ticket?.machineCustomer && (
                    <p className="text-xs font-semibold text-content dark:text-content-dark">
                      👤 {selectedReport.ticket.machineCustomer}
                    </p>
                  )}
                  {selectedReport.ticket?.issueDescription && (
                    <>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary">Customer Complaint</p>
                      <p className="text-sm text-content dark:text-content-dark leading-relaxed whitespace-pre-wrap">{selectedReport.ticket.issueDescription}</p>
                    </>
                  )}
                </div>
              )}

              {/* Warranty badge */}
              {selectedReport.warrantyClaimRequested && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Warranty claim requested for this ticket
                </div>
              )}

              {/* Problem diagnosed */}
              {selectedReport.problemDiagnosed ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Problem Diagnosed</p>
                  <p className="text-sm text-content dark:text-content-dark leading-relaxed">{selectedReport.problemDiagnosed}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Problem Diagnosed</p>
                  <p className="text-sm italic text-content-tertiary dark:text-content-dark-tertiary">Not documented</p>
                </div>
              )}

              {/* Work done */}
              {selectedReport.workDone ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Work Done / Steps Taken</p>
                  <p className="text-sm text-content dark:text-content-dark leading-relaxed">{selectedReport.workDone}</p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Work Done / Steps Taken</p>
                  <p className="text-sm italic text-content-tertiary dark:text-content-dark-tertiary">Not documented</p>
                </div>
              )}

              {/* Parts replaced */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-2">
                  Parts Replaced {selectedReport.parts && selectedReport.parts.length > 0 ? `(${selectedReport.parts.length})` : ""}
                </p>
                {selectedReport.parts && selectedReport.parts.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-line dark:border-line-dark">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-secondary dark:bg-surface-dark-secondary">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary">Part Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-content-secondary dark:text-content-dark-secondary">Part Number</th>
                          <th className="px-3 py-2 text-center font-semibold text-content-secondary dark:text-content-dark-secondary">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-line-dark bg-surface-card dark:bg-surface-dark-card">
                        {selectedReport.parts.map((p: ReplacedPart) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2 font-medium text-content dark:text-content-dark">{p.partName}</td>
                            <td className="px-3 py-2 text-content-secondary dark:text-content-dark-secondary">{p.partNumber ?? "—"}</td>
                            <td className="px-3 py-2 text-center text-content dark:text-content-dark">{p.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm italic text-content-tertiary dark:text-content-dark-tertiary">No parts recorded</p>
                )}
              </div>

              {/* Images */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-2">
                  Images {selectedReport.images && selectedReport.images.length > 0 ? `(${selectedReport.images.length})` : ""}
                </p>
                {selectedReport.images && selectedReport.images.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {selectedReport.images.map((img: WorkReportImage) => (
                      <button
                        key={img.id}
                        onClick={() => setLightboxImg(img.url)}
                        className="relative group rounded-xl overflow-hidden border border-line dark:border-line-dark hover:ring-2 hover:ring-primary/40 transition-all"
                        title={img.fileName}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.fileName}
                          className="w-24 h-24 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-bold">View</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-content-tertiary dark:text-content-dark-tertiary">No images uploaded</p>
                )}
              </div>

              <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
                Last updated: {new Date(selectedReport.updatedAt).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark rounded-b-2xl shrink-0 flex justify-end">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2 rounded-xl text-sm font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors border border-line dark:border-line-dark"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ IMAGE LIGHTBOX ═══════════════════ */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImg}
            alt="Part image"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
