"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
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
  Plus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Menu,
  PanelLeftClose,
  Settings,
  ClipboardList,
  Trash2,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";
import {
  type WorkReport,
  type ReplacedPart,
  type WorkReportImage,
  getWorkReport,
  upsertWorkReport,
  uploadWorkReportImage,
  deleteWorkReportImage,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────
type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

interface DealerTicket {
  id: string;
  ticketNumber?: string;
  status: TicketStatus;
  problemDescription: string;
  issueDescription?: string | null;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  machineCustomer?: string | null;
  machineProductCode?: string | null;
  machineAddress1?: string | null;
  machineAddress2?: string | null;
  machineInvoiceNo?: string | null;
  machineInvoiceDate?: string | null;
  machineWarranty?: number | null;
  phoneNumber?: string | null;
  ageHours?: number;
  createdAt: string;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error" }> = {
  OPEN:        { label: "Open",        variant: "error" },
  ASSIGNED:    { label: "Assigned",    variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PENDING_OTP: { label: "Pending OTP", variant: "default" },
  CLOSED:      { label: "Closed",      variant: "success" },
};

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

const STATUS_TABS: { label: string; value: TicketStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Closed", value: "CLOSED" },
];

// ── Work Report Section (inline for each ticket) ──────────────────────
interface PartRow { partName: string; partNumber: string; quantity: string }

function WorkReportSection({ ticketId }: { ticketId: string }) {
  const [report, setReport] = useState<WorkReport | null | undefined>(undefined); // undefined = loading
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ problemDiagnosed: "", workDone: "", warrantyClaimRequested: false });
  const [parts, setParts] = useState<PartRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [reportError, setReportError] = useState("");
  const [deletingImgId, setDeletingImgId] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    const r = await getWorkReport(ticketId);
    setReport(r);
  }, [ticketId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const openEdit = () => {
    setForm({
      problemDiagnosed: report?.problemDiagnosed ?? "",
      workDone: report?.workDone ?? "",
      warrantyClaimRequested: report?.warrantyClaimRequested ?? false,
    });
    setParts(
      report?.parts?.map((p) => ({
        partName: p.partName,
        partNumber: p.partNumber ?? "",
        quantity: String(p.quantity),
      })) ?? [{ partName: "", partNumber: "", quantity: "1" }]
    );
    setReportError("");
    setEditMode(true);
  };

  const handleSave = async () => {
    setReportError("");
    const validParts = parts
      .filter((p) => p.partName.trim())
      .map((p) => ({ partName: p.partName.trim(), partNumber: p.partNumber.trim() || undefined, quantity: Math.max(1, Number(p.quantity) || 1) }));
    setSaving(true);
    try {
      await upsertWorkReport(ticketId, {
        problemDiagnosed: form.problemDiagnosed.trim() || undefined,
        workDone: form.workDone.trim() || undefined,
        warrantyClaimRequested: form.warrantyClaimRequested,
        parts: validParts,
      });
      await loadReport();
      setEditMode(false);
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true);
    setReportError("");
    try {
      await uploadWorkReportImage(ticketId, file);
      await loadReport();
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImg(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    setDeletingImgId(imageId);
    try {
      await deleteWorkReportImage(ticketId, imageId);
      await loadReport();
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingImgId(null);
    }
  };

  if (report === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-content-secondary dark:text-content-dark-secondary py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading work report...
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-line dark:border-line-dark">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-content dark:text-content-dark uppercase tracking-wider">
          <ClipboardList className="w-3.5 h-3.5 text-primary dark:text-primary-300" />
          Work Report
        </div>
        {!editMode && (
          <button
            onClick={openEdit}
            className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary dark:bg-primary-400/10 dark:text-primary-300 hover:bg-primary/20 transition-colors font-medium"
          >
            {report ? "Edit Report" : "Create Report"}
          </button>
        )}
      </div>

      {reportError && (
        <p className="text-xs text-red-500 mb-2">{reportError}</p>
      )}

      {!editMode && report && (
        <div className="space-y-2.5 text-xs">
          {report.problemDiagnosed && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Problem Diagnosed</p>
              <p className="text-content dark:text-content-dark leading-relaxed">{report.problemDiagnosed}</p>
            </div>
          )}
          {report.workDone && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Work Done</p>
              <p className="text-content dark:text-content-dark leading-relaxed">{report.workDone}</p>
            </div>
          )}
          {report.warrantyClaimRequested && (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Warranty claim requested
            </div>
          )}
          {report.parts && report.parts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Parts Replaced</p>
              <div className="space-y-1">
                {report.parts.map((p: ReplacedPart) => (
                  <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-tertiary dark:bg-surface-dark-tertiary">
                    <span className="font-medium text-content dark:text-content-dark">{p.partName}</span>
                    {p.partNumber && <span className="text-content-secondary dark:text-content-dark-secondary">#{p.partNumber}</span>}
                    <span className="ml-auto text-content-secondary dark:text-content-dark-secondary">×{p.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Images */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">
              Images {report.images && report.images.length > 0 ? `(${report.images.length})` : ""}
            </p>
            {report.images && report.images.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {report.images.map((img: WorkReportImage) => (
                  <div key={img.id} className="relative group">
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.fileName}
                        className="w-16 h-16 object-cover rounded-lg border border-line dark:border-line-dark hover:opacity-80 transition-opacity"
                      />
                    </a>
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={deletingImgId === img.id}
                      className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white shadow"
                      title="Delete image"
                    >
                      {deletingImgId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-content-secondary dark:text-content-dark-secondary italic">No images uploaded yet</p>
            )}
            <label className="mt-2 inline-flex items-center gap-1.5 cursor-pointer text-primary dark:text-primary-300 hover:underline font-medium">
              {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
              {uploadingImg ? "Uploading..." : "Upload Image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingImg}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
              />
            </label>
          </div>
        </div>
      )}

      {!editMode && !report && (
        <p className="text-xs text-content-secondary dark:text-content-dark-secondary italic">No work report yet. Create one to document the service details.</p>
      )}

      {editMode && (
        <div className="space-y-3 text-xs">
          {/* Problem diagnosed */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Problem Diagnosed</label>
            <textarea
              value={form.problemDiagnosed}
              onChange={(e) => setForm((f) => ({ ...f, problemDiagnosed: e.target.value }))}
              rows={2}
              placeholder="Describe the root cause found..."
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          {/* Work done */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">Work Done / Steps Taken</label>
            <textarea
              value={form.workDone}
              onChange={(e) => setForm((f) => ({ ...f, workDone: e.target.value }))}
              rows={2}
              placeholder="Describe what was done to fix the issue..."
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          {/* Warranty claim */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.warrantyClaimRequested}
              onChange={(e) => setForm((f) => ({ ...f, warrantyClaimRequested: e.target.checked }))}
              className="w-4 h-4 accent-primary rounded"
            />
            <span className="text-content dark:text-content-dark font-medium">Warranty claim requested</span>
          </label>
          {/* Parts */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary">Parts Replaced</label>
              <button
                type="button"
                onClick={() => setParts((p) => [...p, { partName: "", partNumber: "", quantity: "1" }])}
                className="text-primary dark:text-primary-300 hover:underline font-medium flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add Part
              </button>
            </div>
            {parts.map((part, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  placeholder="Part name *"
                  value={part.partName}
                  onChange={(e) => setParts((ps) => ps.map((p, i) => i === idx ? { ...p, partName: e.target.value } : p))}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="text"
                  placeholder="Part #"
                  value={part.partNumber}
                  onChange={(e) => setParts((ps) => ps.map((p, i) => i === idx ? { ...p, partNumber: e.target.value } : p))}
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={part.quantity}
                  onChange={(e) => setParts((ps) => ps.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                  className="w-14 px-2.5 py-1.5 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setParts((ps) => ps.filter((_, i) => i !== idx))}
                  className="p-1.5 text-content-tertiary dark:text-content-dark-tertiary hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Images (edit mode) */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-1">
              Images {report?.images && report.images.length > 0 ? `(${report.images.length})` : ""}
            </p>
            {report ? (
              <>
                {report.images && report.images.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {report.images.map((img: WorkReportImage) => (
                      <div key={img.id} className="relative group">
                        <a href={img.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.fileName}
                            className="w-16 h-16 object-cover rounded-lg border border-line dark:border-line-dark hover:opacity-80 transition-opacity"
                          />
                        </a>
                        <button
                          onClick={() => handleDeleteImage(img.id)}
                          disabled={deletingImgId === img.id}
                          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white shadow"
                          title="Delete image"
                        >
                          {deletingImgId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-content-secondary dark:text-content-dark-secondary italic mb-1">No images uploaded yet</p>
                )}
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-primary dark:text-primary-300 hover:underline font-medium">
                  {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  {uploadingImg ? "Uploading..." : "Upload Image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingImg}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                  />
                </label>
              </>
            ) : (
              <p className="text-content-secondary dark:text-content-dark-secondary italic">Save the report first to upload images.</p>
            )}
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-600 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : "Save Report"}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-3.5 py-1.5 rounded-xl border border-line dark:border-line-dark text-xs text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DealerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout, setUser } = useAuth();

  const [tickets, setTickets] = useState<DealerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    problemDescription: "",
    machineName: "",
    machineSerial: "",
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Account settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);

  // ── Responsive ──
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "dealer")) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets", { credentials: "include" });
      if (res.ok) {
        const { tickets: data } = await res.json();
        setTickets(data ?? []);
      }
    } catch {
      setError("Failed to load tickets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "dealer") fetchTickets();
  }, [user, fetchTickets]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.problemDescription.trim()) {
      setError("Problem description is required");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          problemDescription: form.problemDescription.trim(),
          machineName: form.machineName.trim() || undefined,
          machineSerialNumber: form.machineSerial.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to raise ticket");
      } else {
        setSuccess(`Ticket #${data.ticket?.ticketNumber || data.ticket?.id.slice(0, 8)} raised successfully!`);
        setForm({ problemDescription: "", machineName: "", machineSerial: "" });
        setShowForm(false);
        await fetchTickets();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const openSettings = () => {
    setSettingsForm({ email: user?.email ?? "", currentPassword: "", newPassword: "", confirmPassword: "" });
    setSettingsError("");
    setSettingsSuccess("");
    setShowSettings(true);
    setSidebarOpen(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError("");
    setSettingsSuccess("");
    const hasEmail = settingsForm.email.trim() !== (user?.email ?? "");
    const hasPassword = settingsForm.newPassword.length > 0;
    if (!hasEmail && !hasPassword) {
      setSettingsError("No changes to save");
      return;
    }
    if (hasPassword && settingsForm.newPassword !== settingsForm.confirmPassword) {
      setSettingsError("New passwords do not match");
      return;
    }
    if (hasPassword && settingsForm.newPassword.length < 8) {
      setSettingsError("New password must be at least 8 characters");
      return;
    }
    setSettingsSubmitting(true);
    try {
      const body: Record<string, string> = {};
      if (hasEmail) body.email = settingsForm.email.trim();
      if (hasPassword) {
        body.currentPassword = settingsForm.currentPassword;
        body.newPassword = settingsForm.newPassword;
      }
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error || "Update failed");
      } else {
        setSettingsSuccess("Profile updated successfully!");
        setSettingsForm(f => ({ ...f, email: data.user?.email ?? f.email, currentPassword: "", newPassword: "", confirmPassword: "" }));
        // Refresh auth context so UI reflects the change immediately
        if (data.user) {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const { user: fresh } = await meRes.json();
            setUser({ ...fresh, permissions: user?.permissions, languagePref: "en", themePref: "system" });
          }
        }
      }
    } catch {
      setSettingsError("Network error. Please try again.");
    } finally {
      setSettingsSubmitting(false);
    }
  };

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  const displayed = statusFilter === "ALL"
    ? tickets
    : tickets.filter((t) => t.status === statusFilter);

  const openCount = tickets.filter((t) => t.status === "OPEN" || t.status === "ASSIGNED" || t.status === "IN_PROGRESS").length;
  const closedCount = tickets.filter((t) => t.status === "CLOSED").length;

  return (
    <div className="flex h-[100dvh] bg-surface dark:bg-surface-dark overflow-hidden">

      {/* ── Sidebar ── */}
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260} className="overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950 via-orange-900 to-amber-900" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-yellow-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 left-0 w-28 h-28 bg-orange-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center flex-shrink-0">
              <Ticket className="w-5 h-5 text-yellow-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Dealer Portal</p>
              <p className="text-[10px] text-white/50 font-medium">Poornasree AI</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/10 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-white">{tickets.length}</p>
                <p className="text-[9px] text-white/60 font-medium">Total</p>
              </div>
              <div className="bg-white/10 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-yellow-300">{openCount}</p>
                <p className="text-[9px] text-white/60 font-medium">Open</p>
              </div>
              <div className="bg-white/10 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-emerald-300">{closedCount}</p>
                <p className="text-[9px] text-white/60 font-medium">Closed</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/15 text-white shadow-sm ring-1 ring-white/10">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-yellow-400 rounded-full" />
              <span className="text-yellow-300"><Ticket className="w-4 h-4" /></span>
              <span className="flex-1 text-sm font-medium">My Tickets</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{tickets.length}</span>
            </div>
            <button
              onClick={openSettings}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-all"
            >
              <span className="text-white/50"><Settings className="w-4 h-4" /></span>
              Account Settings
            </button>
          </nav>

          {/* User footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/8">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
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

      {/* ── Content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Logo className="h-7 sm:h-8 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content dark:text-content-dark truncate">Dealer Portal</p>
              <p className="text-xs text-content-secondary dark:text-content-dark-secondary truncate">
                {user.firstName} {user.lastName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <ThemeToggle />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm text-content-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
            <button onClick={() => setSuccess("")} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Summary ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="p-3 sm:p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary mb-1">Total Tickets</p>
            <p className="text-xl sm:text-2xl font-bold text-content dark:text-content-dark">{tickets.length}</p>
          </div>
          <div className="p-3 sm:p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary mb-1">Active</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-500">{openCount}</p>
          </div>
          <div className="p-3 sm:p-4 rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark">
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary mb-1">Resolved</p>
            <p className="text-xl sm:text-2xl font-bold text-green-500">{closedCount}</p>
          </div>
        </div>

        {/* ── Raise Ticket Form ─────────────────────────────────── */}
        <div className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark overflow-hidden">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 text-sm font-semibold text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary dark:text-primary-300" />
              Raise New Service Ticket
            </div>
            {showForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showForm && (
            <form onSubmit={handleSubmit} className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 border-t border-line dark:border-line-dark pt-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                  Problem Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.problemDescription}
                  onChange={(e) => setForm((f) => ({ ...f, problemDescription: e.target.value }))}
                  placeholder="Describe the issue in detail..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                    Machine / Product Name
                  </label>
                  <input
                    type="text"
                    value={form.machineName}
                    onChange={(e) => setForm((f) => ({ ...f, machineName: e.target.value }))}
                    placeholder="e.g. PSR-3000 Industrial Mixer"
                    className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1.5">
                    Machine Serial Number
                  </label>
                  <input
                    type="text"
                    value={form.machineSerial}
                    onChange={(e) => setForm((f) => ({ ...f, machineSerial: e.target.value }))}
                    placeholder="e.g. PSR-2024-00001"
                    className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {submitting ? "Submitting..." : "Submit Ticket"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── My Tickets ────────────────────────────────────────── */}
        <section className="space-y-3">
          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-surface-tertiary dark:bg-surface-dark-tertiary">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  statusFilter === tab.value
                    ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                    : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
                )}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">
                  ({tab.value === "ALL" ? tickets.length : tickets.filter((t) => t.status === tab.value).length})
                </span>
              </button>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-secondary dark:text-content-dark-secondary">
              <Ticket className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No tickets found</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-primary dark:text-primary-300 hover:underline"
              >
                Raise your first ticket
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((ticket) => {
                const cfg = STATUS_CONFIG[ticket.status];
                const parsed = parseTicketDescription(ticket.problemDescription);
                const customerDisplay = ticket.machineCustomer || parsed.customerName;
                const locationShort = [
                  [ticket.pincode?.place, ticket.pincode?.district].filter(Boolean).join(", "),
                  ticket.pincode?.code,
                ].filter(Boolean).join(" · ") || ticket.machineAddress2 || ticket.machineAddress1 || parsed.location;
                const machineDisplay = [ticket.machineName, ticket.machineSerialNumber ? `S/N: ${ticket.machineSerialNumber}` : null].filter(Boolean).join(" · ");
                const issueDisplay = ticket.issueDescription || null;
                const isExpanded = expandedId === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    className="rounded-2xl bg-surface-card dark:bg-surface-dark-card border border-line dark:border-line-dark overflow-hidden shadow-sm"
                  >
                    <div className="p-4 space-y-2.5">
                      {/* ── Row 1: ID · Status · Age ── */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {ticket.ticketNumber && (
                          <span className="text-sm font-mono font-bold text-content dark:text-content-dark">#{ticket.ticketNumber}</span>
                        )}
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {typeof ticket.ageHours === "number" && (
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-semibold",
                            ticket.ageHours > 48
                              ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                              : "bg-surface-tertiary dark:bg-surface-dark-tertiary text-content-secondary dark:text-content-dark-secondary"
                          )}>
                            {ticket.ageHours}h old
                          </span>
                        )}
                      </div>

                      {/* ── Structured primary fields ── */}
                      <div className="space-y-1.5">
                        {customerDisplay && (
                          <div className="flex items-start gap-2 text-sm min-w-0">
                            <span className="text-content-secondary dark:text-content-dark-secondary shrink-0 text-[13px]">👤</span>
                            <span className="font-semibold text-content dark:text-content-dark leading-snug truncate">{customerDisplay}</span>
                          </div>
                        )}
                        {locationShort && (
                          <div className="flex items-start gap-2 text-sm min-w-0">
                            <span className="text-content-secondary dark:text-content-dark-secondary shrink-0 text-[13px]">📍</span>
                            <span className="text-content-secondary dark:text-content-dark-secondary leading-snug line-clamp-1">{locationShort}</span>
                          </div>
                        )}
                        {machineDisplay && (
                          <div className="flex items-start gap-2 text-sm min-w-0">
                            <span className="text-content-secondary dark:text-content-dark-secondary shrink-0 text-[13px]">🔧</span>
                            <span className="text-content-secondary dark:text-content-dark-secondary leading-snug truncate">{machineDisplay}</span>
                          </div>
                        )}
                        {issueDisplay && (
                          <div className="flex items-start gap-2 text-sm min-w-0">
                            <span className="text-content-secondary dark:text-content-dark-secondary shrink-0 text-[13px]">💬</span>
                            <span className="font-medium text-content dark:text-content-dark leading-snug line-clamp-2 break-words">{issueDisplay}</span>
                          </div>
                        )}
                      </div>

                      {/* ── Engineer chip + Actions ── */}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {ticket.assignedEngineer && (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary dark:text-primary-300 bg-primary/10 px-2 py-0.5 rounded-full">
                            👷 {ticket.assignedEngineer.firstName} {ticket.assignedEngineer.lastName ?? ""}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            if (!isExpanded) setExpandedId(ticket.id);
                            // scroll into view after expansion happens
                          }}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                          title="Log service performed by your engineer"
                        >
                          <ClipboardList className="w-3 h-3" /> Service Report
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                          className="flex items-center gap-1 text-xs text-content-secondary dark:text-content-dark-secondary hover:text-primary dark:hover:text-primary-300 transition-colors ml-auto"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 pt-3 border-t border-line dark:border-line-dark space-y-3 text-xs break-words">
                          {(ticket.machineCustomer || parsed.customerName) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Customer</p>
                              <p className="font-medium text-content dark:text-content-dark">{ticket.machineCustomer || parsed.customerName}</p>
                            </div>
                          )}
                          {(ticket.machineAddress1 || ticket.machineAddress2 || ticket.pincode) ? (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Full Address</p>
                              {ticket.machineAddress1 && <p className="font-medium text-content dark:text-content-dark">{ticket.machineAddress1}</p>}
                              {ticket.machineAddress2 && <p className="text-content-secondary dark:text-content-dark-secondary">{ticket.machineAddress2}</p>}
                              {ticket.pincode && <p className="text-content-secondary dark:text-content-dark-secondary mt-0.5">Pincode: {ticket.pincode.code} · {[ticket.pincode.district, ticket.pincode.state].filter(Boolean).join(", ")}</p>}
                            </div>
                          ) : parsed.location ? (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Location</p>
                              <p className="font-medium text-content dark:text-content-dark">{parsed.location}</p>
                            </div>
                          ) : null}
                          {(ticket.machineName || ticket.machineSerialNumber || ticket.machineProductCode) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Machine</p>
                              {ticket.machineName && <p className="font-medium text-content dark:text-content-dark">{ticket.machineName}</p>}
                              {ticket.machineSerialNumber && <p className="text-content-secondary dark:text-content-dark-secondary">S/N: {ticket.machineSerialNumber}</p>}
                              {ticket.machineProductCode && <p className="text-content-secondary dark:text-content-dark-secondary">Product Code: {ticket.machineProductCode}</p>}
                            </div>
                          )}
                          {(ticket.machineInvoiceNo || ticket.machineInvoiceDate || ticket.machineWarranty) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Invoice / Warranty</p>
                              {ticket.machineInvoiceNo && <p className="text-content-secondary dark:text-content-dark-secondary">Invoice: {ticket.machineInvoiceNo}</p>}
                              {ticket.machineInvoiceDate && <p className="text-content-secondary dark:text-content-dark-secondary">Date: {ticket.machineInvoiceDate}</p>}
                              {ticket.machineWarranty != null && <p className="text-content-secondary dark:text-content-dark-secondary">Warranty: {ticket.machineWarranty} months</p>}
                            </div>
                          )}
                          {(ticket.phoneNumber || parsed.phone) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Phone</p>
                              <p className="font-medium text-content dark:text-content-dark">{ticket.phoneNumber || parsed.phone}</p>
                            </div>
                          )}
                          {issueDisplay && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider font-bold text-content-secondary dark:text-content-dark-secondary mb-0.5">Complaint</p>
                              <p className="font-medium text-content dark:text-content-dark whitespace-pre-wrap">{issueDisplay}</p>
                            </div>
                          )}
                          <div className="text-content-secondary dark:text-content-dark-secondary">
                            <span className="opacity-60">Created:</span> {formatRelativeTime(new Date(ticket.createdAt))}
                          </div>
                          {/* Work Report — always available for dealer tickets */}
                          <WorkReportSection ticketId={ticket.id} />
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
      </div>

      {/* ── Account Settings Modal ─────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-xl border border-line dark:border-line-dark">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark">
              <div>
                <h2 className="text-base font-semibold text-content dark:text-content-dark">Account Settings</h2>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5">{user.email}</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                <X className="w-4 h-4 text-content-secondary dark:text-content-dark-secondary" />
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="p-5 space-y-4">
              {settingsError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />{settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />{settingsSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Email Address</label>
                <input
                  type="email"
                  value={settingsForm.email}
                  onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="pt-2 border-t border-line dark:border-line-dark">
                <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary mb-3">Change Password <span className="font-normal">(leave blank to keep current)</span></p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Current Password</label>
                    <input
                      type="password"
                      placeholder="Required to change password"
                      value={settingsForm.currentPassword}
                      onChange={e => setSettingsForm(f => ({ ...f, currentPassword: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">New Password</label>
                    <input
                      type="password"
                      placeholder="Min 8 characters"
                      value={settingsForm.newPassword}
                      onChange={e => setSettingsForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      placeholder="Repeat new password"
                      value={settingsForm.confirmPassword}
                      onChange={e => setSettingsForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2 text-sm rounded-xl border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {settingsSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
