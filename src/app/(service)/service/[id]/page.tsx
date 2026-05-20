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
  StickyNote,
  Clock,
  CircleDot,
  Circle,
  Check,
  Home,
} from "lucide-react";
import { getSocket } from "@/lib/socket-client";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OTP
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");

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

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addLogEntry("note", noteText.trim());
    setNoteText("");
    setShowNoteInput(false);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const tag = photos.length === 0 ? "Before" : "After";
    setPhotos(prev => [...prev, { url, tag }]);
    addLogEntry("photo", `Photo captured (${tag})`, url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

          {/* ── IN-PROGRESS ACTIONS ──────────────────────────────────── */}
          {(ticket.status === "IN_PROGRESS" || ticket.status === "PENDING_OTP") && (
            <div className="flex gap-2">
              <button onClick={() => setShowNoteInput(true)}
                className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" />
                Add Note
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Take Photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={handlePhotoCapture} />
            </div>
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
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</h3>
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
              <h3 className="text-sm font-bold text-amber-800 mb-1">Ready to close?</h3>
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
                <h3 className="text-sm font-bold text-purple-800">Verify OTP</h3>
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

        </div>
      </main>
    </div>
  );
}
