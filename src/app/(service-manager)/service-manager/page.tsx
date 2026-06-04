"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/Loading";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import ResponsiveSidebar from "@/components/ui/ResponsiveSidebar";
import { SidebarBrand } from "@/components/ui";
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
  Star,
  Award,
  Zap,
  TrendingUp,
  UserCircle,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { getStates, getDistricts, getPincodes, type PincodeEntry } from "@/lib/indiaLocations";
import { getSocket } from "@/lib/socket-client";
import { TicketDrawer } from "@/components/service-manager/TicketDrawer";
import { parseTicketDescription, resolveTicketCustomerName } from "@/components/service-manager/utils";
import { getAssignmentMode, DEALER_RESPONSE_LABELS } from "@/components/service-manager/assignmentMode";
import TestCustomerPanel from "@/components/admin/TestCustomerPanel";
import {
  type WorkReport,
  type ReplacedPart,
  type WorkReportImage,
  listWorkReports,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";
type DateRange = "all" | "today" | "7days" | "30days";
type PageView = "tickets" | "engineers" | "locations" | "dealers" | "work-reports" | "engineer-updates" | "assistants" | "feedback";

interface EngineerFeedbackEntry {
  ticketNumber: string;
  rating: number;
  comment: string | null;
  customerName: string | null;
  closedAt: string | null;
}

interface EngineerStat {
  engineer: { id: string; firstName: string; lastName?: string | null };
  closedCount: number;
  feedbackCount: number;
  avgRating: number | null;
  feedbacks: EngineerFeedbackEntry[];
}

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

interface Dealer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  warrantyMonths?: number | null;
  whatsappNumber?: string | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
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
  dealer?: { id?: string; firstName: string; lastName?: string | null } | null;
  dealerId?: string | null;
  assignedDealer?: { id: string; firstName: string; lastName?: string | null } | null;
  passtestMatched?: boolean;
  dealerResponse?: string | null;
  dealerRespondedAt?: string | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
  phoneNumber?: string | null;
  customerAddress?: string | null;
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
  const [dealerDropdownOpen, setDealerDropdownOpen] = useState<string | null>(null);

  const [drawerTicket, setDrawerTicket] = useState<ServiceTicket | null>(null);
  const [closedCollapsed, setClosedCollapsed] = useState(false);
  const [, setDrawerReassign] = useState(false);
  const [, setDrawerConfirmEng] = useState<Engineer | null>(null);
  const [assigningDealerId, setAssigningDealerId] = useState<string | null>(null);

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
  const [engineerCreated, setEngineerCreated] = useState<{
    name: string;
    email: string;
    setPasswordUrl: string;
    sentViaWhatsapp: boolean;
    hadWhatsappInput: boolean;
  } | null>(null);

  // ── Team modal state — Edit ──
  const [editingEng, setEditingEng] = useState<Engineer | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", newPassword: "", whatsappNumber: "", pincodeIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [resendingSetupLink, setResendingSetupLink] = useState(false);
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
  const [newDealer, setNewDealer] = useState({ firstName: "", lastName: "", email: "", password: "", warrantyMonths: "" as string, pincode: "", city: "", state: "", whatsappNumber: "" });
  const [addingDealer, setAddingDealer] = useState(false);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [editDealerForm, setEditDealerForm] = useState({ firstName: "", lastName: "", newPassword: "", warrantyMonths: "" as string, pincode: "", city: "", state: "", whatsappNumber: "" });
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

  // ── Feedback / performance state ──
  const [engineerFeedback, setEngineerFeedback] = useState<EngineerStat[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackEngineerFilter, setFeedbackEngineerFilter] = useState<string | null>(null);

  // ── Bulk import state ──
  type ImportType = "engineers" | "dealers" | "assistants";
  const [showImportModal, setShowImportModal] = useState<ImportType | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importReplaceAll, setImportReplaceAll] = useState(true);
  const [deletingAllDealers, setDeletingAllDealers] = useState(false);
  const [importResult, setImportResult] = useState<{ deleted?: number; created: number; skipped: number; errors: number; skippedEmails: string[] } | null>(null);

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

  // ── Bulk import handler ──
  const handleImport = async () => {
    if (!importFile || !showImportModal) return;
    const token = localStorage.getItem("token");
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (showImportModal === "dealers" && !importReplaceAll) {
        formData.append("replaceAll", "false");
      }
      const res = await fetch(`/api/manager/import/${showImportModal}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text.slice(0, 120) || `Import failed (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(String(data.error || "Import failed"));
      setImportResult(data);
      setImportFile(null);
      // Refresh the relevant list
      if (showImportModal === "engineers") {
        const r = await fetch("/api/manager/engineers", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.engineers) setEngineers(d.engineers);
      } else if (showImportModal === "dealers") {
        const r = await fetch("/api/manager/dealers", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.dealers) setDealers(d.dealers);
      } else if (showImportModal === "assistants") {
        const r = await fetch("/api/manager/assistants", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.assistants) setAssistants(d.assistants);
      }
    } catch (err: unknown) {
      setImportResult({ created: 0, skipped: 0, errors: 1, skippedEmails: [(err instanceof Error ? err.message : "Unknown error")] });
    } finally {
      setImportLoading(false);
    }
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
    if (editingEng.source !== "hr" && !editForm.email.trim()) { setError("Email is required"); return; }
    setSavingEdit(true);
    try {
      const basicBody: Record<string, string | undefined> = {};
      if (editForm.firstName.trim() !== editingEng.firstName) basicBody.firstName = editForm.firstName.trim();
      if (editForm.lastName.trim() !== (editingEng.lastName ?? "")) basicBody.lastName = editForm.lastName.trim();
      if (
        editingEng.source !== "hr" &&
        editForm.email.trim().toLowerCase() !== editingEng.email.toLowerCase()
      ) {
        basicBody.email = editForm.email.trim();
      }
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
  const readApiError = async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      return (data as { error?: string }).error || fallback;
    } catch {
      return fallback;
    }
  };

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
      if (!ticketsRes.ok) { setError(await readApiError(ticketsRes, "Failed to load tickets")); return; }
      if (!engineersRes.ok) { setError(await readApiError(engineersRes, "Failed to load engineers")); return; }
      if (!pincodesRes.ok) { setError(await readApiError(pincodesRes, "Failed to load pincodes")); return; }
      if (!dealersRes.ok) { setError(await readApiError(dealersRes, "Failed to load dealers")); return; }
      if (!assistantsRes.ok) { setError(await readApiError(assistantsRes, "Failed to load assistants")); return; }
      const { tickets: t } = await ticketsRes.json();
      const { engineers: e } = await engineersRes.json();
      const { pincodes: p } = await pincodesRes.json();
      const { dealers: d } = await dealersRes.json();
      const { assistants: a } = await assistantsRes.json();
      setTickets(t ?? []);
      setEngineers(e ?? []);
      setMyPincodes(p ?? []);
      setDealers(d ?? []);
      setAssistants(a ?? []);
      // Work reports
      try { const reports = await listWorkReports(); setWorkReports(reports); } catch { /* non-fatal */ }
    } catch { setError("Failed to load data — check your connection and try refreshing."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.role === "service_manager") fetchData(); }, [user, fetchData]);

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
        sentViaWhatsapp: !!data.sentViaWhatsapp,
        hadWhatsappInput: !!eng.whatsappNumber,
      });
      await fetchData();
    } catch {
      setError("Network error");
    } finally {
      setResendingSetupLink(false);
    }
  };

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/tickets/engineer-feedback", { credentials: "include", cache: "no-store" });
      if (res.ok) { const { engineerStats } = await res.json(); setEngineerFeedback(engineerStats ?? []); }
    } catch { /* non-fatal */ } finally { setFeedbackLoading(false); }
  }, []);

  useEffect(() => { if (user?.role === "service_manager") fetchFeedback(); }, [user, fetchFeedback]);

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

  const handleAssignDealer = async (ticketId: string, dealerId: string) => {
    setAssigningDealerId(ticketId);
    setDealerDropdownOpen(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign-dealer`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ dealerId }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to assign dealer"); }
      else await fetchData();
    } catch { setError("Network error"); }
    finally { setAssigningDealerId(null); }
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
        const hadWhatsappInput = !!newEng.whatsappNumber.trim();
        setEngineerCreated({
          name: newEng.firstName.trim(),
          email: newEng.email.trim(),
          setPasswordUrl: data.setPasswordUrl,
          sentViaWhatsapp: !!data.sentViaWhatsapp,
          hadWhatsappInput,
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
        const mc = (t.machineCustomer ?? "").toLowerCase();
        const mn = (t.machineName ?? "").toLowerCase();
        const sn = (t.machineSerialNumber ?? "").toLowerCase();
        const ph = (t.phoneNumber ?? "").toLowerCase();
        const pc = (t.pincode?.code ?? "").toLowerCase();
        const pl = [t.pincode?.place, t.pincode?.district].filter(Boolean).join(" ").toLowerCase();
        return tn.includes(q) || mc.includes(q) || mn.includes(q) || sn.includes(q) || ph.includes(q) || pc.includes(q) || pl.includes(q);
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

    // Split pool into dealer-raised and customer-raised
    const dealerPool = pool.filter(t => t.dealer !== null && t.dealer !== undefined);
    const customerPool = pool.filter(t => !t.dealer);

    const makeGroups = (p: ServiceTicket[]) => ({
      needsAssignment: p.filter(t => t.status === "OPEN" && !t.assignedEngineer && !t.assignedDealer).sort(sortByAge),
      withDealer:      p.filter(t => t.status === "OPEN" && !!t.assignedDealer).sort(sortByAge),
      withEngineer:    p.filter(t => ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"].includes(t.status)).sort(sortByAge),
      closed:          p.filter(t => t.status === "CLOSED").sort(sortByAge),
    });

    return { dealer: makeGroups(dealerPool), customer: makeGroups(customerPool) };
  }, [tickets, archivedIds, dateRange, searchQuery, dealerFilter, modelFilter, complaintFilter]);

  const dealerActionLog = useMemo(
    () =>
      tickets
        .filter((t) => t.dealerRespondedAt && t.dealerResponse)
        .sort(
          (a, b) =>
            new Date(b.dealerRespondedAt!).getTime() - new Date(a.dealerRespondedAt!).getTime(),
        ),
    [tickets],
  );

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
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260} className="overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950 via-indigo-900 to-blue-950" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-indigo-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full">
          <SidebarBrand title="Service Manager" onClose={() => setSidebarOpen(false)} />

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {([
              { key: "tickets" as PageView, label: "Tickets", icon: <Ticket className="w-4 h-4" />, count: total },
              { key: "engineers" as PageView, label: "Engineers", icon: <Users className="w-4 h-4" />, count: engineers.length },
              { key: "feedback" as PageView, label: "Feedback", icon: <Star className="w-4 h-4" />, count: engineerFeedback.reduce((s, e) => s + e.feedbackCount, 0) || undefined },
              { key: "locations" as PageView, label: "Locations", icon: <MapPin className="w-4 h-4" />, count: myPincodes.length },
              { key: "assistants" as PageView, label: "Assistants", icon: <ShieldCheck className="w-4 h-4" />, count: assistants.length },
              { key: "dealers" as PageView, label: "Dealers", icon: <Store className="w-4 h-4" />, count: dealers.length },
              { key: "work-reports" as PageView, label: "Dealer Updates", icon: <ClipboardList className="w-4 h-4" />, count: dealerActionLog.length || undefined },
              { key: "engineer-updates" as PageView, label: "Engineer Updates", icon: <ClipboardList className="w-4 h-4" />, count: workReports.filter(r => r.dealer?.role === "service_engineer").length || undefined },
            ]).map((nav) => (
              <button
                key={nav.key}
                onClick={() => { setPageView(nav.key); if (isMobile) setSidebarOpen(false); }}
                className={cn(
                  "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  pageView === nav.key
                    ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                )}
              >
                {pageView === nav.key && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-full" />
                )}
                <span className={cn(pageView === nav.key ? "text-cyan-300" : "text-white/50 group-hover:text-white/70")}>
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
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
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

      {/* ═══════════════════ CONTENT ═══════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ═══════════════════ HEADER BANNER ═══════════════════ */}
        <div className="shrink-0 bg-gradient-to-r from-blue-950 via-indigo-900 to-blue-900 px-4 sm:px-6 pt-3 pb-4">
          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen((v) => !v)}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-base font-bold text-white leading-tight">Service Manager</h1>
                <p className="text-xs text-white/50">{user.firstName} {user.lastName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <button onClick={handleRefresh} disabled={refreshing}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              </button>
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner">
              <div className="flex items-start justify-between">
                <p className="text-3xl font-black text-white">{total}</p>
                <Ticket className="w-5 h-5 text-blue-200 opacity-70 mt-1" />
              </div>
              <p className="text-[11px] text-blue-200 font-semibold mt-1 uppercase tracking-wide">Total Tickets</p>
            </div>
            <div className={cn("rounded-2xl px-4 py-3.5 border shadow-inner", unassigned > 0 ? "bg-red-500/30 border-red-300/40" : "bg-white/10 border-white/20")}>
              <div className="flex items-start justify-between">
                <p className={cn("text-3xl font-black", unassigned > 0 ? "text-red-200" : "text-white/50")}>{unassigned}</p>
                <AlertCircle className={cn("w-5 h-5 mt-1", unassigned > 0 ? "text-red-300 opacity-70" : "text-white/20")} />
              </div>
              <p className={cn("text-[11px] font-semibold mt-1 uppercase tracking-wide", unassigned > 0 ? "text-red-200" : "text-white/40")}>Open</p>
            </div>
            <div className={cn("rounded-2xl px-4 py-3.5 border shadow-inner", active > 0 ? "bg-cyan-500/30 border-cyan-300/40" : "bg-white/10 border-white/20")}>
              <div className="flex items-start justify-between">
                <p className={cn("text-3xl font-black", active > 0 ? "text-cyan-200" : "text-white/50")}>{active}</p>
                <Zap className={cn("w-5 h-5 mt-1", active > 0 ? "text-cyan-300 opacity-70" : "text-white/20")} />
              </div>
              <p className={cn("text-[11px] font-semibold mt-1 uppercase tracking-wide", active > 0 ? "text-cyan-200" : "text-white/40")}>Active</p>
            </div>
            <div className={cn("rounded-2xl px-4 py-3.5 border shadow-inner", closed > 0 ? "bg-emerald-500/30 border-emerald-300/40" : "bg-white/10 border-white/20")}>
              <div className="flex items-start justify-between">
                <p className={cn("text-3xl font-black", closed > 0 ? "text-emerald-200" : "text-white/50")}>{closed}</p>
                <CheckCircle className={cn("w-5 h-5 mt-1", closed > 0 ? "text-emerald-300 opacity-70" : "text-white/20")} />
              </div>
              <p className={cn("text-[11px] font-semibold mt-1 uppercase tracking-wide", closed > 0 ? "text-emerald-200" : "text-white/40")}>Closed</p>
            </div>
          </div>

          {/* Resolution progress bar */}
          {total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-[11px] text-white/50 font-medium">Resolution Rate</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-300">{Math.round((closed / total) * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-all duration-700"
                  style={{ width: `${Math.round((closed / total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

      <main className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-900">
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
              <TestCustomerPanel onCleared={() => fetchData()} />

              {/* ── Toolbar ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-0.5 bg-white dark:bg-surface-dark-secondary shadow-sm p-1 rounded-lg border border-slate-200 dark:border-white/10">
                  {([
                    { key: "all" as DateRange, label: "All" },
                    { key: "today" as DateRange, label: "Today" },
                    { key: "7days" as DateRange, label: "7d" },
                    { key: "30days" as DateRange, label: "30d" },
                  ]).map(d => (
                    <button key={d.key} onClick={() => setDateRange(d.key)}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-medium transition-all",
                        dateRange === d.key
                          ? "bg-white dark:bg-surface-dark shadow-sm text-blue-700 dark:text-blue-300 font-semibold"
                          : "text-content-tertiary dark:text-content-dark-tertiary hover:text-content dark:hover:text-content-dark"
                      )}>{d.label}</button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary dark:text-content-dark-tertiary" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="w-full sm:w-48 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark text-content dark:text-content-dark placeholder:text-content-tertiary dark:placeholder:text-content-dark-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  {hasActiveFilters && (
                    <button onClick={resetFilters} className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Clear filters"><RotateCcw className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => setShowFilters(f => !f)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      showFilters
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-blue-400"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:border-blue-400 transition-colors">
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
                const { dealer: dealerGroups, customer: customerGroups } = ticketGroups;
                const totalVisible =
                  dealerGroups.needsAssignment.length + dealerGroups.withDealer.length + dealerGroups.withEngineer.length + dealerGroups.closed.length +
                  customerGroups.needsAssignment.length + customerGroups.withDealer.length + customerGroups.withEngineer.length + customerGroups.closed.length;

                const renderTicketCard = (ticket: ServiceTicket) => {
                  const canAssign = ticket.status === "OPEN";
                  const isArchived = archivedIds.has(ticket.id);
                  const customerDisplay = resolveTicketCustomerName(ticket);
                  const parsedIssue = parseTicketDescription(ticket.issueDescription ?? "");
                  const locationShort = [
                    [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
                    ticket.pincode?.code,
                  ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsedIssue.location;
                  const complaintDisplay = ticket.problemDescription;
                  const isPending = ticket.status === "OPEN" && !ticket.assignedEngineer && !ticket.assignedDealer;
                  const assignmentMode = getAssignmentMode(ticket);

                  const isOverdue = (ticket.ageHours ?? 0) > 24 && ticket.status !== "CLOSED";
                  const needsActionSoon = isPending && (ticket.ageHours ?? 0) >= 6;
                  const borderColor = isOverdue ? "border-l-red-500" : needsActionSoon ? "border-l-amber-400" : "border-l-transparent";

                  const isAssignDropdownOpen = dropdownOpen === ticket.id;

                  return (
                    <div key={ticket.id}
                      onClick={() => setDrawerTicket(ticket)}
                      className={cn(
                        "bg-white dark:bg-surface-dark-card rounded-xl border border-slate-200 dark:border-line-dark border-l-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-500 shadow-sm cursor-pointer",
                        isAssignDropdownOpen ? "relative z-30 overflow-visible" : "overflow-hidden",
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

                        {/* ── Row 5: Assigned engineer chip ── */}
                        {ticket.assignedEngineer && (
                          <div className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary">
                            <UserCircle className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="font-medium truncate">{ticket.assignedEngineer.firstName}{ticket.assignedEngineer.lastName ? ` ${ticket.assignedEngineer.lastName}` : ""}</span>
                          </div>
                        )}

                        {/* ── Row 5b: Assigned dealer chip ── */}
                        {ticket.assignedDealer && (
                          <div className="flex items-center gap-2 flex-wrap text-xs text-violet-600 dark:text-violet-400">
                            <span className="flex items-center gap-1 font-medium truncate">
                              <Store className="w-3.5 h-3.5 shrink-0" />
                              Dealer: {ticket.assignedDealer.firstName}{ticket.assignedDealer.lastName ? ` ${ticket.assignedDealer.lastName}` : ""}
                            </span>
                            {ticket.dealerResponse && (
                              <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 text-[10px] font-semibold">
                                {DEALER_RESPONSE_LABELS[ticket.dealerResponse] ?? ticket.dealerResponse}
                              </span>
                            )}
                          </div>
                        )}

                        {/* ── Row 6: Assign action (for OPEN tickets only) ── */}
                        <div className="flex items-center justify-end pt-1">
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {canAssign && !isArchived && assignmentMode === "engineer" && (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDropdownOpen(isAssignDropdownOpen ? null : ticket.id);
                                    }}
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

                                  {isAssignDropdownOpen && (() => {
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
                                      <div className="absolute right-0 top-full mt-1 w-60 z-40 rounded-lg bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark shadow-xl overflow-hidden max-h-64 overflow-y-auto">
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
                                            <button
                                              key={eng.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAssignEngineer(ticket.id, eng.id);
                                              }}
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

                            {canAssign && !isArchived && assignmentMode === "matched-dealer" && ticket.dealerId && ticket.dealer && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 truncate max-w-[120px]">
                                  {ticket.dealer.firstName}{ticket.dealer.lastName ? ` ${ticket.dealer.lastName}` : ""}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAssignDealer(ticket.id, ticket.dealerId!); }}
                                  disabled={assigningDealerId === ticket.id}
                                  className="flex items-center gap-1 h-7 px-2.5 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {assigningDealerId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Store className="w-3 h-3" />}
                                  Assign
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                };

                const groupTheme: Record<string, { badge: string; label: string; dot: string }> = {
                  "Needs Assignment": { badge: "bg-red-100 text-red-700 border border-red-200", label: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
                  "With Dealer":      { badge: "bg-violet-100 text-violet-700 border border-violet-200", label: "text-violet-700 dark:text-violet-400", dot: "bg-violet-500" },
                  "With Engineer":    { badge: "bg-cyan-100 text-cyan-700 border border-cyan-200", label: "text-cyan-700 dark:text-cyan-400", dot: "bg-cyan-500" },
                  "Closed":           { badge: "bg-emerald-100 text-emerald-700 border border-emerald-200", label: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
                };

                const renderGroup = (title: string, icon: string, tickets: ServiceTicket[]) => {
                  if (tickets.length === 0) return null;
                  const isClosedGroup = title === "Closed";
                  const isCollapsed = isClosedGroup && closedCollapsed;
                  const theme = groupTheme[title] ?? { badge: "bg-slate-100 text-slate-600 border border-slate-200", label: "text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };
                  return (
                    <div key={title}>
                      <button
                        onClick={() => isClosedGroup && setClosedCollapsed(c => !c)}
                        className={cn("flex items-center gap-2 mb-2 w-full text-left sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 py-1", isClosedGroup && "cursor-pointer")}
                      >
                        <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", theme.dot)} />
                        <span className={cn("text-xs font-bold uppercase tracking-wide", theme.label)}>{title}</span>
                        <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", theme.badge)}>{tickets.length}</span>
                        {isClosedGroup && (
                          <span className="ml-auto">
                            {isCollapsed ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronUp className="w-3 h-3 text-slate-400" />}
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
                  <div className="space-y-6">
                    {/* ── Dealer-Raised Tickets ── */}
                    {(dealerGroups.needsAssignment.length + dealerGroups.withDealer.length + dealerGroups.withEngineer.length + dealerGroups.closed.length) > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Store className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          <h3 className="text-sm font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Dealer Tickets</h3>
                        </div>
                        <div className="space-y-5">
                          {renderGroup("Needs Assignment", "⚠️", dealerGroups.needsAssignment)}
                          {renderGroup("With Dealer", "🏪", dealerGroups.withDealer)}
                          {renderGroup("With Engineer", "🔧", dealerGroups.withEngineer)}
                          {renderGroup("Closed", "✅", dealerGroups.closed)}
                        </div>
                      </div>
                    )}

                    {/* ── Customer-Raised Tickets ── */}
                    {(customerGroups.needsAssignment.length + customerGroups.withDealer.length + customerGroups.withEngineer.length + customerGroups.closed.length) > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <UserCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                          <h3 className="text-sm font-bold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">Customer Tickets</h3>
                        </div>
                        <div className="space-y-5">
                          {renderGroup("Needs Assignment", "⚠️", customerGroups.needsAssignment)}
                          {renderGroup("With Dealer", "🏪", customerGroups.withDealer)}
                          {renderGroup("With Engineer", "🔧", customerGroups.withEngineer)}
                          {renderGroup("Closed", "✅", customerGroups.closed)}
                        </div>
                      </div>
                    )}
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
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowImportModal("engineers"); setImportFile(null); setImportResult(null); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                    <Upload className="w-4 h-4" /> Import
                  </button>
                  <button onClick={() => setShowAddEngineer(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add Engineer
                  </button>
                </div>
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
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowImportModal("assistants"); setImportFile(null); setImportResult(null); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                    <Upload className="w-4 h-4" /> Import
                  </button>
                  <button onClick={() => setShowAddAssistant(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add Assistant
                  </button>
                </div>
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
                                    pincodeIds: Array.from(new Set([...f.pincodeIds, ...filteredPincodes.map(p => p.id)])),
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
                                    pincodeIds: Array.from(new Set([...f.pincodeIds, ...filteredPincodes.map(p => p.id)])),
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
                <div className="flex items-center gap-2">
                  <button
                    disabled={deletingAllDealers || dealers.length === 0}
                    onClick={async () => {
                      if (!confirm(`Delete all ${dealers.length} dealer(s)? Tickets are kept; dealer links will be cleared.`)) return;
                      setDeletingAllDealers(true);
                      try {
                        const res = await fetch("/api/manager/dealers/all", { method: "DELETE", credentials: "include" });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Failed to delete dealers");
                        await fetchData();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to delete all dealers");
                      } finally {
                        setDeletingAllDealers(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {deletingAllDealers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete All
                  </button>
                  <button onClick={() => { setShowImportModal("dealers"); setImportFile(null); setImportResult(null); setImportReplaceAll(true); }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                    <Upload className="w-4 h-4" /> Import
                  </button>
                  <button onClick={() => setShowAddDealer(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Add Dealer
                  </button>
                </div>
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
                          {dlr.whatsappNumber && (
                            <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary truncate">{dlr.whatsappNumber}</p>
                          )}
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
                                city: dlr.pincode?.place ?? "",
                                state: dlr.pincode?.state ?? "",
                                whatsappNumber: dlr.whatsappNumber ?? "",
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

          {/* ═══════════════════ DEALER ACTION LOG ═══════════════════ */}
          {pageView === "work-reports" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-content dark:text-content-dark">Dealer Updates</h2>
                <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                  Accept, reject, and complete actions from dealers — {dealerActionLog.length} update{dealerActionLog.length !== 1 ? "s" : ""}
                </p>
              </div>

              {dealerActionLog.length === 0 ? (
                <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                  <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">No dealer actions yet</p>
                  <p className="text-xs mt-1">Actions appear when dealers accept, reject, or complete assigned tickets</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line dark:border-line-dark shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-secondary dark:bg-surface-dark-secondary">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Dealer</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Ticket #</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Action</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Machine</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Time</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-line-dark bg-surface-card dark:bg-surface-dark-card">
                      {dealerActionLog.map((t) => (
                        <tr key={t.id} className="hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                          <td className="px-4 py-3 font-medium text-content dark:text-content-dark">
                            {t.assignedDealer
                              ? `${t.assignedDealer.firstName}${t.assignedDealer.lastName ? " " + t.assignedDealer.lastName : ""}`
                              : t.dealer
                                ? `${t.dealer.firstName}${t.dealer.lastName ? " " + t.dealer.lastName : ""}`
                                : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-primary dark:text-primary-300">
                            {t.ticketNumber ? `#${t.ticketNumber}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full font-semibold capitalize",
                              t.dealerResponse === "accepted" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                              t.dealerResponse === "rejected" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                              t.dealerResponse === "completed" && "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
                            )}>
                              {DEALER_RESPONSE_LABELS[t.dealerResponse!] ?? t.dealerResponse}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary">
                            {t.machineName ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-content-secondary dark:text-content-dark-secondary">
                            {t.dealerRespondedAt
                              ? formatRelativeTime(new Date(t.dealerRespondedAt))
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setDrawerTicket(t)}
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

          {/* ════════════════ ENGINEER UPDATES VIEW ════════════════ */}
          {pageView === "engineer-updates" && (() => {
            const engReports = workReports.filter(r => r.dealer?.role === "service_engineer");
            return (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-content dark:text-content-dark">Engineer Work Updates</h2>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                    Service reports, notes &amp; photos submitted by engineers directly — {engReports.length} report{engReports.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {engReports.length === 0 ? (
                  <div className="bg-surface-card dark:bg-surface-dark-card rounded-xl border border-line dark:border-line-dark shadow-sm py-16 flex flex-col items-center text-content-tertiary dark:text-content-dark-tertiary">
                    <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">No engineer reports yet</p>
                    <p className="text-xs mt-1">Reports appear once engineers start filling their service report during work</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line dark:border-line-dark shadow-sm">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-secondary dark:bg-surface-dark-secondary">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Engineer</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Ticket #</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Machine</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Complaint</th>
                          <th className="px-4 py-2.5 text-left font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Updated</th>
                          <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Photos</th>
                          <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">Parts</th>
                          <th className="px-4 py-2.5 text-center font-semibold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wide">View</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-line-dark bg-surface-card dark:bg-surface-dark-card">
                        {engReports.map((r) => (
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
                                (r._count?.images ?? 0) > 0
                                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                                  : "text-content-tertiary dark:text-content-dark-tertiary"
                              )}>
                                {r._count?.images ?? 0}
                              </span>
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
            );
          })()}

          {/* ═══════════════════ FEEDBACK VIEW ═══════════════════ */}
          {pageView === "feedback" && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-content dark:text-content-dark">Engineer Performance</h2>
                  <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Customer ratings collected after ticket closure via WhatsApp</p>
                </div>
                <button
                  onClick={fetchFeedback}
                  disabled={feedbackLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", feedbackLoading && "animate-spin")} />
                  Refresh
                </button>
              </div>

              {feedbackLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : engineerFeedback.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Star className="w-10 h-10 text-content-tertiary dark:text-content-dark-tertiary mb-3 opacity-30" />
                  <p className="text-sm font-medium text-content-secondary dark:text-content-dark-secondary">No engineers found</p>
                  <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary mt-1">Add engineers to your team to see their performance here</p>
                </div>
              ) : (
                <>
                  {/* ── Leaderboard ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {engineerFeedback.map((stat, idx) => {
                      const isBest = idx === 0 && stat.avgRating !== null;
                      const fullName = `${stat.engineer.firstName}${stat.engineer.lastName ? " " + stat.engineer.lastName : ""}`;
                      return (
                        <div
                          key={stat.engineer.id}
                          onClick={() => setFeedbackEngineerFilter(feedbackEngineerFilter === stat.engineer.id ? null : stat.engineer.id)}
                          className={cn(
                            "relative rounded-xl border p-4 cursor-pointer transition-all",
                            isBest
                              ? "border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 shadow-sm"
                              : "border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card hover:border-primary/40",
                            feedbackEngineerFilter === stat.engineer.id && "ring-2 ring-primary/40"
                          )}
                        >
                          {isBest && (
                            <div className="absolute -top-2.5 left-3 flex items-center gap-1 bg-yellow-400 dark:bg-yellow-500 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                              <Award className="w-3 h-3" />
                              Best Engineer
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-2 mt-1">
                            <div>
                              <p className="text-sm font-semibold text-content dark:text-content-dark">{fullName}</p>
                              <div className="flex items-center gap-0.5 mt-1">
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Star
                                    key={s}
                                    className={cn(
                                      "w-3.5 h-3.5",
                                      stat.avgRating !== null && s <= Math.round(stat.avgRating)
                                        ? "fill-yellow-400 text-yellow-400"
                                        : "text-content-tertiary dark:text-content-dark-tertiary opacity-30"
                                    )}
                                  />
                                ))}
                                {stat.avgRating !== null && (
                                  <span className="ml-1 text-xs font-semibold text-content dark:text-content-dark">{stat.avgRating.toFixed(1)}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-bold text-content dark:text-content-dark">{stat.feedbackCount}</p>
                              <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary">reviews</p>
                            </div>
                          </div>
                          <div className="flex gap-3 mt-3 pt-3 border-t border-line dark:border-line-dark">
                            <div className="text-center flex-1">
                              <p className="text-sm font-semibold text-content dark:text-content-dark">{stat.closedCount}</p>
                              <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary">Closed</p>
                            </div>
                            <div className="text-center flex-1">
                              <p className="text-sm font-semibold text-content dark:text-content-dark">{stat.avgRating !== null ? stat.avgRating.toFixed(1) : "—"}</p>
                              <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary">Avg Rating</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Feedback list ── */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <p className="text-sm font-semibold text-content dark:text-content-dark mr-1">Customer Reviews</p>
                      <button
                        onClick={() => setFeedbackEngineerFilter(null)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                          feedbackEngineerFilter === null
                            ? "bg-primary text-white"
                            : "bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                        )}
                      >
                        All Engineers
                      </button>
                      {engineerFeedback.filter(s => s.feedbackCount > 0).map(stat => (
                        <button
                          key={stat.engineer.id}
                          onClick={() => setFeedbackEngineerFilter(feedbackEngineerFilter === stat.engineer.id ? null : stat.engineer.id)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                            feedbackEngineerFilter === stat.engineer.id
                              ? "bg-primary text-white"
                              : "bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover"
                          )}
                        >
                          {stat.engineer.firstName}
                        </button>
                      ))}
                    </div>

                    {(() => {
                      const filtered = engineerFeedback
                        .filter(s => feedbackEngineerFilter === null || s.engineer.id === feedbackEngineerFilter)
                        .flatMap(s => s.feedbacks.map(f => ({ ...f, engineer: s.engineer })));

                      if (filtered.length === 0) {
                        return (
                          <div className="py-10 text-center">
                            <p className="text-sm text-content-tertiary dark:text-content-dark-tertiary">No feedback yet. Ratings arrive via WhatsApp after each ticket closure.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {filtered.map((f, i) => (
                            <div key={i} className="rounded-xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-0.5">
                                      {[1, 2, 3, 4, 5].map(s => (
                                        <Star
                                          key={s}
                                          className={cn(
                                            "w-3.5 h-3.5",
                                            s <= f.rating
                                              ? "fill-yellow-400 text-yellow-400"
                                              : "text-content-tertiary dark:text-content-dark-tertiary opacity-30"
                                          )}
                                        />
                                      ))}
                                      <span className="ml-1 text-xs font-bold text-content dark:text-content-dark">{f.rating}/5</span>
                                    </div>
                                    <span className="text-xs text-content-tertiary dark:text-content-dark-tertiary">·</span>
                                    <span className="text-xs text-content-secondary dark:text-content-dark-secondary">{f.customerName || "Customer"}</span>
                                    <span className="text-xs text-content-tertiary dark:text-content-dark-tertiary">·</span>
                                    <span className="text-xs bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-1.5 py-0.5 rounded-full font-mono text-content-tertiary dark:text-content-dark-tertiary">{f.ticketNumber}</span>
                                  </div>
                                  {f.comment && (
                                    <p className="mt-1.5 text-sm text-content dark:text-content-dark leading-relaxed">&ldquo;{f.comment}&rdquo;</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">{`${f.engineer.firstName}${f.engineer.lastName ? " " + f.engineer.lastName : ""}`}</p>
                                  {f.closedAt && (
                                    <p className="text-xs text-content-tertiary dark:text-content-dark-tertiary mt-0.5">{formatRelativeTime(new Date(f.closedAt))}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
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
                <h3 className="text-sm font-bold text-green-800 dark:text-green-300">Setup link ready</h3>
              </div>
              <button onClick={() => setEngineerCreated(null)} className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                <span className="font-semibold text-content dark:text-content-dark">{engineerCreated.name}</span> has been added.
                {engineerCreated.sentViaWhatsapp
                  ? " The set-password link and login details were sent on WhatsApp."
                  : engineerCreated.hadWhatsappInput
                    ? " WhatsApp could not be delivered. Use Resend setup link on the engineer card, or copy the link below."
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
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Login email *</label>
                <input type="email" value={newEng.email} onChange={e => setNewEng(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="arun@example.com" />
                <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Used at login. After setup, first name also works as username.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary dark:text-content-dark-tertiary" />
                  <input type="tel" value={newEng.whatsappNumber} onChange={e => setNewEng(p => ({ ...p, whatsappNumber: e.target.value }))}
                    placeholder="8089732385 or 918089732385"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
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

      {/* Close dropdowns on outside click */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-20"
          aria-hidden
          onClick={() => setDropdownOpen(null)}
        />
      )}
      {dealerDropdownOpen && (
        <div
          className="fixed inset-0 z-20"
          aria-hidden
          onClick={() => setDealerDropdownOpen(null)}
        />
      )}

      {/* ═══════════════════ TICKET DECISION PANEL ═══════════════════ */}
      {drawerTicket && (
        <TicketDrawer
          ticket={drawerTicket}
          engineers={sortedEngineers}
          dealers={dealers}
          isArchived={archivedIds.has(drawerTicket.id)}
          assigningId={assigningId}
          assigningDealerId={assigningDealerId}
          onClose={() => { setDrawerTicket(null); setDrawerReassign(false); setDrawerConfirmEng(null); }}
          onAssignEngineer={handleAssignEngineer}
          onAssignDealer={handleAssignDealer}
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
                {editingEng.pendingSetup && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">This engineer has not set a password yet.</p>
                )}
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

              {/* Login email */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">
                  Login email {editingEng.source !== "hr" && "*"}
                </label>
                <input type="email" value={editForm.email} disabled={editingEng.source === "hr"}
                  onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60" />
                {editingEng.source === "hr" && (
                  <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-1">Email is managed by HR sync</p>
                )}
              </div>

              {/* Set login password (optional) */}
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Set login password <span className="font-normal text-content-tertiary dark:text-content-dark-tertiary">(optional)</span></label>
                <input type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Min 8 characters" />
                <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">Use this if the engineer lost the setup link.</p>
              </div>

              {/* Resend setup link */}
              <div className="rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark px-3 py-3 space-y-2">
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">Send a fresh set-password link (expires in 7 days).</p>
                <button
                  type="button"
                  onClick={() => editingEng && handleResendSetupLink(editingEng)}
                  disabled={resendingSetupLink}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-primary text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
                >
                  {resendingSetupLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Resend setup link
                </button>
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
                <input type="text" value={newDealer.pincode} onChange={e => setNewDealer(p => ({ ...p, pincode: e.target.value.trim() }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. 560001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">City</label>
                  <input type="text" value={newDealer.city} onChange={e => setNewDealer(p => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Bangalore" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">State</label>
                  <input type="text" value={newDealer.state} onChange={e => setNewDealer(p => ({ ...p, state: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Karnataka" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Mobile Number</label>
                <input type="text" value={newDealer.whatsappNumber} onChange={e => setNewDealer(p => ({ ...p, whatsappNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="9482414666" />
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
                        city: newDealer.city.trim() || undefined,
                        state: newDealer.state.trim() || undefined,
                        whatsappNumber: newDealer.whatsappNumber.trim() || undefined,
                      }),
                    });
                    if (!res.ok) { const { error: msg } = await res.json(); setError(msg || "Failed to add dealer"); }
                    else {
                      setShowAddDealer(false);
                      setNewDealer({ firstName: "", lastName: "", email: "", password: "", warrantyMonths: "", pincode: "", city: "", state: "", whatsappNumber: "" });
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
                <input type="text" value={editDealerForm.pincode} onChange={e => setEditDealerForm(p => ({ ...p, pincode: e.target.value.trim() }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="e.g. 560001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">City</label>
                  <input type="text" value={editDealerForm.city} onChange={e => setEditDealerForm(p => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">State</label>
                  <input type="text" value={editDealerForm.state} onChange={e => setEditDealerForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-1">Mobile Number</label>
                <input type="text" value={editDealerForm.whatsappNumber} onChange={e => setEditDealerForm(p => ({ ...p, whatsappNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
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
                    if (editDealerForm.city.trim() !== (editingDealer.pincode?.place ?? "")) body.city = editDealerForm.city.trim() || null;
                    if (editDealerForm.state.trim() !== (editingDealer.pincode?.state ?? "")) body.state = editDealerForm.state.trim() || null;
                    if (editDealerForm.whatsappNumber.trim() !== (editingDealer.whatsappNumber ?? "")) {
                      body.whatsappNumber = editDealerForm.whatsappNumber.trim() || null;
                    }
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

      {/* ── Bulk Import Modal ─────────────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl w-full max-w-md border border-line dark:border-line-dark">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line dark:border-line-dark">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary dark:text-primary-300" />
                <h3 className="text-base font-bold text-content dark:text-content-dark capitalize">
                  Import {showImportModal}
                </h3>
              </div>
              <button onClick={() => { setShowImportModal(null); setImportFile(null); setImportResult(null); setImportReplaceAll(true); }}
                className="p-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                <X className="w-5 h-5 text-content-secondary dark:text-content-dark-secondary" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Column guide */}
              <div className="rounded-lg bg-surface-hover dark:bg-surface-dark-hover p-3 text-xs text-content-secondary dark:text-content-dark-secondary space-y-1">
                <p className="font-semibold text-content dark:text-content-dark mb-1">Required Excel columns:</p>
                {showImportModal === "engineers" && <><p>• <span className="font-medium">firstName</span> (required)</p><p>• email (required)</p><p>• lastName, whatsappNumber (optional)</p></>}
                {showImportModal === "assistants" && <><p>• <span className="font-medium">firstName</span> (required)</p><p>• email (required)</p><p>• lastName, whatsappNumber (optional)</p></>}
                {showImportModal === "dealers" && (
                  <>
                    <p>• <span className="font-medium">DEALER NAME</span> (required)</p>
                    <p>• STATE, PINCODE, CITY, MOBILE NUMBER (optional)</p>
                    <p>• email, password auto-generated if omitted (default: Dealer@2026)</p>
                    <p className="text-amber-600 dark:text-amber-400">Works with the official dealer Excel (header on row 5)</p>
                  </>
                )}
              </div>

              {/* Replace-all option for dealer import */}
              {showImportModal === "dealers" && (
                <label className="flex items-start gap-2 text-xs text-content-secondary dark:text-content-dark-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importReplaceAll}
                    onChange={e => setImportReplaceAll(e.target.checked)}
                    className="mt-0.5 rounded border-line"
                  />
                  <span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">Replace all existing dealers</span>
                    {" "}— deletes current dealer accounts before import (tickets preserved, dealer links cleared)
                  </span>
                </label>
              )}

              {/* File input */}
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line dark:border-line-dark rounded-xl p-6 cursor-pointer hover:border-primary dark:hover:border-primary-300 transition-colors">
                <Upload className="w-8 h-8 text-content-tertiary dark:text-content-dark-tertiary" />
                <span className="text-sm text-content-secondary dark:text-content-dark-secondary">
                  {importFile ? importFile.name : "Click to select .xlsx file"}
                </span>
                <input type="file" accept=".xlsx" className="hidden" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }} />
              </label>

              {/* Result banner */}
              {importResult && (
                <div className={cn("rounded-lg p-3 text-sm space-y-1", importResult.errors > 0 ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200")}>
                  <p className="font-semibold">
                    {importResult.deleted != null && importResult.deleted > 0 ? `${importResult.deleted} deleted · ` : ""}
                    {importResult.created} created · {importResult.skipped} skipped · {importResult.errors} errors
                  </p>
                  {importResult.skippedEmails.length > 0 && (
                    <p className="text-xs opacity-80">Skipped/Errors: {importResult.skippedEmails.slice(0, 5).join(", ")}{importResult.skippedEmails.length > 5 ? ` +${importResult.skippedEmails.length - 5} more` : ""}</p>
                  )}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!importFile || importLoading}
                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {importLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
