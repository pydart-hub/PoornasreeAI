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
  Plus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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

export default function DealerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();

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

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  const displayed = statusFilter === "ALL"
    ? tickets
    : tickets.filter((t) => t.status === statusFilter);

  const openCount = tickets.filter((t) => t.status === "OPEN" || t.status === "ASSIGNED" || t.status === "IN_PROGRESS").length;
  const closedCount = tickets.filter((t) => t.status === "CLOSED").length;

  return (
    <div className="flex flex-col h-[100dvh] bg-surface dark:bg-surface-dark overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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
          <span className="hidden sm:block">
            <Avatar name={`${user.firstName} ${user.lastName || ""}`} size="sm" />
          </span>
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
                const issueDisplay = ticket.issueDescription || (parsed.isStructured ? null : ticket.problemDescription);
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

                      {/* ── Engineer chip + View Details ── */}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {ticket.assignedEngineer && (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary dark:text-primary-300 bg-primary/10 px-2 py-0.5 rounded-full">
                            👷 {ticket.assignedEngineer.firstName} {ticket.assignedEngineer.lastName ?? ""}
                          </span>
                        )}
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
                          <div className="text-content-secondary dark:text-content-dark-secondary">
                            <span className="opacity-60">Created:</span> {formatRelativeTime(new Date(ticket.createdAt))}
                          </div>
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
  );
}
