"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/Loading";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Play,
  Send,
  KeyRound,
  CheckCircle2,
  Loader2,
  Camera,
  ImageIcon,
  StickyNote,
  Clock,
  CircleDot,
  Circle,
  Check,
  Home,
  ClipboardList,
  Plus,
  Trash2,
  X,
  AlertCircle,
  ListChecks,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";
import {
  getWorkReport,
  upsertWorkReport,
  uploadWorkReportImage,
  deleteWorkReportImage,
  workReportImageSrc,
  type WorkReport,
  type WorkReportImage,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────
type TicketStatus = "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

interface Ticket {
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
  ageHours?: number;
  phoneNumber?: string | null;
  customerAddress?: string | null;
  createdAt: string;
  updatedAt: string;
  firstEngineeredAt?: string | null;
  closedAt?: string | null;
  customer?: { id: string; firstName: string; lastName?: string | null; email: string } | null;
  assignedManager?: { id: string; firstName: string; lastName?: string | null } | null;
  pincode?: { id: string; code: string; place?: string | null; district?: string | null; state?: string | null } | null;
}

interface WorkLog {
  id: string;
  timestamp: string;
  type: "note" | "photo" | "status" | "checklist";
  text: string;
  imageUrl?: string;
}

// ── Checklist templates by issue keywords ─────────────────────────────
const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  default: [
    "Inspect machine condition",
    "Identify root cause",
    "Perform repair / replacement",
    "Test after fix",
    "Clean work area",
    "Brief customer on resolution",
  ],
  installation: [
    "Verify site readiness",
    "Unpack & inspect equipment",
    "Connect power & peripherals",
    "Run initial calibration",
    "Test all functions",
    "Hand over to customer",
  ],
  maintenance: [
    "Visual inspection",
    "Check wear parts",
    "Clean / replace filters",
    "Lubricate moving parts",
    "Run diagnostics",
    "Log readings",
  ],
};

function getChecklist(issueText: string): string[] {
  const lower = (issueText || "").toLowerCase();
  if (lower.includes("install")) return CHECKLIST_TEMPLATES.installation;
  if (lower.includes("maintenance") || lower.includes("service") || lower.includes("amc"))
    return CHECKLIST_TEMPLATES.maintenance;
  return CHECKLIST_TEMPLATES.default;
}

// ── Parse structured description ──────────────────────────────────────
function parseDescription(desc: string) {
  const pairs: Record<string, string> = {};
  for (const line of desc.split("\n")) {
    const m = line.match(/^([^:\n]+?):\s*(.+)$/);
    if (m) pairs[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return {
    isStructured: Object.keys(pairs).length >= 2,
    customerName: pairs["customer"] || pairs["customer name"] || undefined,
    location:
      pairs["location"] ||
      [pairs["address1"], pairs["address2"]].filter(Boolean).join(", ") ||
      [pairs["place"], pairs["district"], pairs["state"]].filter(Boolean).join(", ") ||
      undefined,
    phone: pairs["phone"] || undefined,
  };
}

// ── Status timeline steps ────────────────────────────────────────────
const STEPS: { key: TicketStatus; label: string }[] = [
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "PENDING_OTP", label: "OTP Verify" },
  { key: "CLOSED", label: "Closed" },
];
const STATUS_ORDER: TicketStatus[] = ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"];

// ═══════════════════════════════════════════════════════════════════════
export default function WorkExecutionScreen() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Work log (local only — no backend endpoint)
  const [workLog, setWorkLog] = useState<WorkLog[]>([]);
  const [noteText, setNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Checklist
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  // Photos (local preview only — no upload endpoint)
  const [photos, setPhotos] = useState<{ url: string; tag: string }[]>([]);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const photoGalleryRef = useRef<HTMLInputElement>(null);

  // OTP
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");

  // Work Report (persisted)
  const [workReport, setWorkReport] = useState<WorkReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportDiagnosed, setReportDiagnosed] = useState("");
  const [reportWorkDone, setReportWorkDone] = useState("");
  const [reportWarranty, setReportWarranty] = useState(false);
  const [reportParts, setReportParts] = useState<{ partName: string; partNumber: string; quantity: number }[]>([]);
  const [reportImageUploading, setReportImageUploading] = useState(false);
  const [reportSaveStatus, setReportSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [reportSaveMessage, setReportSaveMessage] = useState("");
  const [reportImageMessage, setReportImageMessage] = useState("");
  const reportCameraRef = useRef<HTMLInputElement>(null);
  const reportGalleryRef = useRef<HTMLInputElement>(null);

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    else if (!authLoading && user && !["service", "admin", "service_engineer"].includes(user.role))
      router.replace("/");
  }, [user, authLoading, router]);

  // ── Fetch ticket ───────────────────────────────────────────────────
  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket || data);
        if ((data.ticket || data).status === "PENDING_OTP") setOtpRequested(true);
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => {
    if (user && ticketId) fetchTicket();
  }, [user, ticketId, fetchTicket]);

  // ── Real-time ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const socket = getSocket({
      userId: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName || ""}`.trim(),
    });
    const refresh = () => fetchTicket();
    socket.on("ticket:updated", refresh);
    return () => { socket.off("ticket:updated", refresh); };
  }, [user, fetchTicket]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleStartWork = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/start`, {
        method: "PATCH", credentials: "include",
      });
      if (res.ok) {
        await fetchTicket();
        addLogEntry("status", "Work started");
      }
    } catch { /* non-fatal */ }
    finally { setActionLoading(false); }
  }, [ticketId, fetchTicket]);

  const handleRequestOtp = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setOtpRequested(true);
        await fetchTicket();
        addLogEntry("status", "OTP requested — sent to customer");
      }
    } catch { /* non-fatal */ }
    finally { setActionLoading(false); }
  }, [ticketId, fetchTicket]);

  const handleResendOtp = useCallback(async () => {
    setOtpError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend: true }),
      });
      if (res.ok) {
        addLogEntry("status", "OTP resent — new code sent to customer");
      } else {
        const data = await res.json().catch(() => ({}));
        setOtpError(data.error || "Failed to resend OTP");
      }
    } catch { setOtpError("Network error"); }
    finally { setActionLoading(false); }
  }, [ticketId]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length !== 4) { setOtpError("Enter 4 digits"); return; }
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error || "Verification failed"); return; }
      addLogEntry("status", "OTP verified — ticket closed");
      await fetchTicket();
    } catch {
      setOtpError("Network error");
    } finally { setOtpLoading(false); }
  }, [ticketId, otp, fetchTicket]);

  // ── Work Report helpers ────────────────────────────────────────────
  const fetchWorkReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const report = await getWorkReport(ticketId);
      if (report) {
        setWorkReport(report);
        setReportDiagnosed(report.problemDiagnosed || "");
        setReportWorkDone(report.workDone || "");
        setReportWarranty(report.warrantyClaimRequested ?? false);
        setReportParts(
          (report.parts || []).map(p => ({
            partName: p.partName,
            partNumber: p.partNumber || "",
            quantity: p.quantity,
          }))
        );
        if (report.images && report.images.length > 0) {
          setPhotos(
            report.images.map((img, i) => ({
              url: workReportImageSrc(img.url),
              tag: i === 0 ? "Before" : "After",
            }))
          );
        }
      }
    } catch { /* non-fatal */ }
    finally { setReportLoading(false); }
  }, [ticketId]);

  useEffect(() => {
    if (user && ticketId) fetchWorkReport();
  }, [user, ticketId, fetchWorkReport]);

  const handleSaveReport = useCallback(async () => {
    setReportSaving(true);
    setReportSaveStatus("idle");
    setReportSaveMessage("");
    try {
      const saved = await upsertWorkReport(ticketId, {
        problemDiagnosed: reportDiagnosed,
        workDone: reportWorkDone,
        warrantyClaimRequested: reportWarranty,
        parts: reportParts.filter(p => p.partName.trim()),
      });
      setWorkReport(saved);
      setReportSaveStatus("success");
      setReportSaveMessage("Report saved successfully.");
    } catch (err) {
      setReportSaveStatus("error");
      setReportSaveMessage(err instanceof Error ? err.message : "Could not save report. Try again.");
    } finally {
      setReportSaving(false);
    }
  }, [ticketId, reportDiagnosed, reportWorkDone, reportWarranty, reportParts]);

  const handleReportImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportImageUploading(true);
    setReportImageMessage("");
    try {
      const img = await uploadWorkReportImage(ticketId, file);
      setWorkReport(prev => prev ? { ...prev, images: [...(prev.images || []), img] } : prev);
      setPhotos(prev => [...prev, { url: workReportImageSrc(img.url), tag: prev.length === 0 ? "Before" : "After" }]);
      setReportImageMessage("Photo uploaded.");
    } catch (err) {
      setReportImageMessage(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setReportImageUploading(false);
      if (reportCameraRef.current) reportCameraRef.current.value = "";
      if (reportGalleryRef.current) reportGalleryRef.current.value = "";
    }
  }, [ticketId]);

  const handleDeleteReportImage = useCallback(async (imageId: string) => {
    try {
      await deleteWorkReportImage(ticketId, imageId);
      setWorkReport(prev => prev ? { ...prev, images: (prev.images || []).filter(i => i.id !== imageId) } : prev);
    } catch { /* non-fatal */ }
  }, [ticketId]);

  // ── Work log helpers ───────────────────────────────────────────────
  const addLogEntry = (type: WorkLog["type"], text: string, imageUrl?: string) => {
    setWorkLog(prev => [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      text,
      imageUrl,
    }, ...prev]);
  };

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;
    const text = noteText.trim();
    addLogEntry("note", text);
    setNoteText("");
    setShowNoteInput(false);
    // Persist note to work report
    const ts = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const entry = `[Note ${ts}] ${text}`;
    const newWorkDone = reportWorkDone ? `${reportWorkDone}\n${entry}` : entry;
    setReportWorkDone(newWorkDone);
    try {
      const saved = await upsertWorkReport(ticketId, {
        problemDiagnosed: reportDiagnosed,
        workDone: newWorkDone,
        warrantyClaimRequested: reportWarranty,
        parts: reportParts.filter(p => p.partName.trim()),
      });
      setWorkReport(saved);
    } catch { /* non-fatal */ }
  }, [noteText, reportWorkDone, reportDiagnosed, reportWarranty, reportParts, ticketId]);

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const tag = photos.length === 0 ? "Before" : "After";
    setReportImageMessage("");
    try {
      const img = await uploadWorkReportImage(ticketId, file);
      const url = workReportImageSrc(img.url);
      setPhotos(prev => [...prev, { url, tag }]);
      addLogEntry("photo", `Photo captured (${tag})`, url);
      setWorkReport(prev => prev ? { ...prev, images: [...(prev.images || []), img] } : prev);
      setReportImageMessage("Photo uploaded — visible to service manager.");
    } catch (err) {
      setReportImageMessage(err instanceof Error ? err.message : "Photo upload failed. Service manager will not see this photo.");
    }
    if (photoCameraRef.current) photoCameraRef.current.value = "";
    if (photoGalleryRef.current) photoGalleryRef.current.value = "";
  }, [photos.length, ticketId]);

  const toggleChecklist = (idx: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ── Guards ─────────────────────────────────────────────────────────
  if (authLoading || loading) return <LoadingScreen message="Loading..." />;
  if (!user || !ticket) return null;

  // ── Derived data ───────────────────────────────────────────────────
  const parsed = parseDescription(ticket.problemDescription);
  const parsedIssue = parseDescription(ticket.issueDescription ?? "");
  const issueText = ticket.issueDescription || (parsed.isStructured ? parsed.customerName : ticket.problemDescription);
  const customerName = ticket.machineCustomer || parsedIssue.customerName || parsed.customerName
    || (ticket.customer ? `${ticket.customer.firstName} ${ticket.customer.lastName ?? ""}`.trim() : null);
  const locationFull = [
    ticket.machineAddress1, ticket.machineAddress2,
    ticket.pincode?.place, ticket.pincode?.district, ticket.pincode?.state,
    ticket.pincode?.code,
  ].filter(Boolean).join(", ") || parsed.location || "";
  const phoneNumber = ticket.phoneNumber || parsed.phone || "";
  const machineDisplay = [ticket.machineName, ticket.machineSerialNumber ? `S/N ${ticket.machineSerialNumber}` : null].filter(Boolean).join(" · ");
  const checklist = getChecklist(issueText || "");
  const currentStepIdx = STATUS_ORDER.indexOf(ticket.status);
  const mapsUrl = locationFull ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationFull)}` : "";

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* ═══ STICKY HEADER ════════════════════════════════════════════ */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-4 pt-3 pb-2">
        <div className="max-w-xl mx-auto">
          {/* Back + ticket number */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => router.push("/service")}
              className="p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-400 font-mono">
              {ticket.ticketNumber ? `#${ticket.ticketNumber}` : `#${ticket.id.slice(0, 8).toUpperCase()}`}
            </span>
          </div>

          {/* Issue title */}
          <h1 className="text-base font-bold text-gray-900 leading-snug mb-2">
            {issueText || "Service Request"}
          </h1>

          {/* Context row: Location + Customer */}
          <div className="flex flex-col gap-1.5">
            {ticket.customerAddress && (
              <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100">
                <Home className="w-3.5 h-3.5 shrink-0 text-blue-500 mt-0.5" />
                <span className="text-xs font-semibold text-blue-700 leading-snug">{ticket.customerAddress}</span>
              </div>
            )}
            {locationFull && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span className="truncate">{locationFull}</span>
                </div>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors">
                    Maps →
                  </a>
                )}
              </div>
            )}
            {(customerName || phoneNumber) && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
                  <span className="truncate">👤 {customerName || "Customer"}</span>
                </div>
                {phoneNumber && (
                  <a href={`tel:${phoneNumber}`}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors">
                    <Phone className="w-3 h-3" />
                    Call
                  </a>
                )}
              </div>
            )}
            {machineDisplay && (
              <p className="text-[11px] text-gray-400">🛠 {machineDisplay}</p>
            )}
          </div>
        </div>
      </header>

      {/* ═══ SCROLLABLE BODY ══════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-4 space-y-4">

          {/* ── STATUS TIMELINE ──────────────────────────────────────── */}
          <section className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              {STEPS.map((step, i) => {
                const done = i < currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <div key={step.key} className="flex items-center gap-1 flex-1">
                    <div className="flex flex-col items-center gap-0.5">
                      {done ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : active ? (
                        <CircleDot className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300" />
                      )}
                      <span className={cn(
                        "text-[9px] font-medium text-center leading-tight",
                        done ? "text-emerald-600" : active ? "text-blue-600" : "text-gray-300"
                      )}>{step.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={cn(
                        "flex-1 h-px mx-1",
                        i < currentStepIdx ? "bg-emerald-400" : "bg-gray-200"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── PRIMARY ACTION ───────────────────────────────────────── */}
          {ticket.status === "ASSIGNED" && (
            <button onClick={handleStartWork} disabled={actionLoading}
              className="w-full h-12 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm">
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              Start Work
            </button>
          )}

          {/* ── WHAT TO COMPLETE (job checklist) ───────────────────── */}
          {ticket.status !== "CLOSED" && ticket.status !== "ASSIGNED" && (
            <section className="bg-blue-50 rounded-xl border border-blue-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide">What to complete on this job</h3>
              </div>
              <ol className="text-xs text-blue-900 space-y-1 list-decimal list-inside leading-relaxed">
                <li><strong>Field checklist</strong> — tick items as you inspect and repair.</li>
                <li><strong>Work notes &amp; photos</strong> — add notes or capture before/after photos (saved to server).</li>
                <li><strong>Service report</strong> — fill diagnosis, work done, parts, and report photos; tap <strong>Save Report</strong>.</li>
                <li><strong>Close ticket</strong> — request customer OTP, then verify to close.</li>
              </ol>
            </section>
          )}

          {/* ── IN-PROGRESS ACTIONS (notes & quick photos) ─────────── */}
          {(ticket.status === "IN_PROGRESS" || ticket.status === "PENDING_OTP") && (
            <section className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">2. Work notes &amp; photos</h3>
              <button
                type="button"
                onClick={() => setShowNoteInput(true)}
                className="w-full h-10 rounded-lg text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <StickyNote className="w-3.5 h-3.5" />
                Add Note
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => photoCameraRef.current?.click()}
                  className="h-10 rounded-lg text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => photoGalleryRef.current?.click()}
                  className="h-10 rounded-lg text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Choose File
                </button>
              </div>
              <input
                ref={photoCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              <input
                ref={photoGalleryRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              {reportImageMessage && (
                <p className={cn(
                  "text-xs",
                  reportImageMessage.includes("failed") ? "text-red-600" : "text-emerald-600"
                )}>{reportImageMessage}</p>
              )}
            </section>
          )}

          {/* ── NOTE INPUT ───────────────────────────────────────────── */}
          {showNoteInput && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                placeholder="Describe what you did..."
                className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowNoteInput(false); setNoteText(""); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddNote} disabled={!noteText.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-all flex items-center gap-1">
                  <Send className="w-3 h-3" />
                  Save
                </button>
              </div>
            </div>
          )}

          {/* ── PHOTO PREVIEWS ───────────────────────────────────────── */}
          {photos.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-100 p-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.tag} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] font-bold text-center py-0.5">
                      {photo.tag}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── SMART CHECKLIST ──────────────────────────────────────── */}
          {ticket.status !== "CLOSED" && (
            <section className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">1. Field checklist</h3>
                <span className="text-[10px] text-gray-400 font-medium">
                  {checkedItems.size}/{checklist.length}
                </span>
              </div>
              <div className="space-y-1">
                {checklist.map((item, idx) => {
                  const done = checkedItems.has(idx);
                  return (
                    <button key={idx} onClick={() => toggleChecklist(idx)}
                      className="w-full flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-gray-50 transition-colors text-left">
                      <span className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        done ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                      )}>
                        {done && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className={cn(
                        "text-sm leading-tight transition-colors",
                        done ? "text-gray-400 line-through" : "text-gray-700"
                      )}>{item}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── WORK LOG ─────────────────────────────────────────────── */}
          {workLog.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-100 p-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Work Log</h3>
              <div className="space-y-2">
                {workLog.map(entry => (
                  <div key={entry.id} className="flex gap-2">
                    <div className="w-1 rounded-full shrink-0 mt-1 bg-blue-200" style={{ minHeight: 16 }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-700 leading-snug">{entry.text}</p>
                      {entry.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.imageUrl} alt="" className="mt-1 w-20 h-20 rounded-lg object-cover" />
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        <Clock className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />
                        {formatRelativeTime(new Date(entry.timestamp))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── OTP COMPLETION SECTION ────────────────────────────────── */}
          {ticket.status === "IN_PROGRESS" && !otpRequested && (
            <section className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <h3 className="text-sm font-bold text-amber-800 mb-1">4. Ready to close?</h3>
              <p className="text-xs text-amber-600 mb-3">Request an OTP from the customer to verify completion.</p>
              <button onClick={handleRequestOtp} disabled={actionLoading}
                className="w-full h-10 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Request OTP
              </button>
            </section>
          )}

          {(ticket.status === "PENDING_OTP" || (ticket.status === "IN_PROGRESS" && otpRequested)) && (
            <section className="bg-purple-50 rounded-xl border border-purple-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-purple-800">4. Verify OTP</h3>
                <button onClick={handleResendOtp} disabled={actionLoading}
                  className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-40 transition-colors underline underline-offset-2">
                  {actionLoading ? "Sending…" : "Resend OTP"}
                </button>
              </div>
              <p className="text-xs text-purple-600">Enter the 4-digit code the customer received on WhatsApp.</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                className="w-full text-center text-2xl font-mono tracking-[0.3em] rounded-xl px-4 py-3 border border-purple-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
              {otpError && <p className="text-xs text-red-500 text-center">{otpError}</p>}
              <button onClick={handleVerifyOtp} disabled={otpLoading || otp.length !== 4}
                className="w-full h-10 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Verify &amp; Close
              </button>
            </section>
          )}

          {/* ── CLOSED STATE ──────────────────────────────────────────── */}
          {ticket.status === "CLOSED" && (
            <section className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-emerald-800">Job Completed</h3>
              <p className="text-xs text-emerald-600 mt-1">
                {ticket.closedAt ? `Closed ${formatRelativeTime(new Date(ticket.closedAt))}` : "This ticket is closed."}
              </p>
            </section>
          )}

          {/* ── SERVICE REPORT ────────────────────────────────────────── */}
          {(ticket.status === "IN_PROGRESS" || ticket.status === "PENDING_OTP" || ticket.status === "CLOSED") && (
            <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-500" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-800">3. Service report (required for manager)</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Save after filling fields below. Photos upload immediately.</p>
                </div>
                {reportLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
              </div>

              {/* Diagnosis */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <span className="text-indigo-600 font-semibold">A.</span> Problem diagnosed
                </label>
                <textarea
                  value={reportDiagnosed}
                  onChange={e => setReportDiagnosed(e.target.value)}
                  rows={3}
                  placeholder="Describe the root cause…"
                  className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Work Done */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <span className="text-indigo-600 font-semibold">B.</span> Work done / steps taken
                </label>
                <textarea
                  value={reportWorkDone}
                  onChange={e => setReportWorkDone(e.target.value)}
                  rows={3}
                  placeholder="What was repaired / replaced…"
                  className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Warranty */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportWarranty}
                  onChange={e => setReportWarranty(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-600"><span className="text-indigo-600 font-semibold">C.</span> Warranty claim required</span>
              </label>

              {/* Parts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500"><span className="text-indigo-600 font-semibold">D.</span> Replaced parts</label>
                  <button
                    onClick={() => setReportParts(prev => [...prev, { partName: "", partNumber: "", quantity: 1 }])}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Part
                  </button>
                </div>
                {reportParts.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No parts listed</p>
                )}
                <div className="space-y-2">
                  {reportParts.map((part, idx) => (
                    <div key={idx} className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={part.partName}
                        onChange={e => setReportParts(prev => prev.map((p, i) => i === idx ? { ...p, partName: e.target.value } : p))}
                        placeholder="Part name"
                        className="flex-1 text-xs rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <input
                        type="text"
                        value={part.partNumber}
                        onChange={e => setReportParts(prev => prev.map((p, i) => i === idx ? { ...p, partNumber: e.target.value } : p))}
                        placeholder="Part #"
                        className="w-20 text-xs rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <input
                        type="number"
                        min={1}
                        value={part.quantity}
                        onChange={e => setReportParts(prev => prev.map((p, i) => i === idx ? { ...p, quantity: Math.max(1, Number(e.target.value)) } : p))}
                        className="w-12 text-xs rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-center"
                      />
                      <button onClick={() => setReportParts(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Photos */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  <span className="text-indigo-600 font-semibold">E.</span> Report photos
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => reportCameraRef.current?.click()}
                    disabled={reportImageUploading}
                    className="h-9 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                  >
                    {reportImageUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => reportGalleryRef.current?.click()}
                    disabled={reportImageUploading}
                    className="h-9 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                  >
                    {reportImageUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    Choose File
                  </button>
                </div>
                <input
                  ref={reportCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleReportImageUpload}
                />
                <input
                  ref={reportGalleryRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleReportImageUpload}
                />
                {(workReport?.images || []).length === 0 && !reportImageUploading && (
                  <p className="text-xs text-gray-400 italic">No photos yet</p>
                )}
                {(workReport?.images || []).length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {(workReport?.images || []).map((img: WorkReportImage) => (
                      <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={workReportImageSrc(img.url)} alt={img.fileName || "photo"} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleDeleteReportImage(img.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {reportSaveMessage && (
                <div className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                  reportSaveStatus === "success" && "bg-emerald-50 text-emerald-800 border border-emerald-200",
                  reportSaveStatus === "error" && "bg-red-50 text-red-800 border border-red-200",
                )}>
                  {reportSaveStatus === "error" && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {reportSaveStatus === "success" && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{reportSaveMessage}</span>
                </div>
              )}

              {/* Save */}
              <button
                onClick={handleSaveReport}
                disabled={reportSaving}
                className="w-full h-10 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {reportSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {reportSaving ? "Saving…" : "Save Report"}
              </button>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
