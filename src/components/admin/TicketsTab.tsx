"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Ticket, Download } from "lucide-react";

interface TicketItem {
  id: string;
  ticketNumber: string;
  status: string;
  problemDescription: string;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  createdAt: string;
  closedAt?: string | null;
  ageHours?: number;
  responseTimeHours?: number | null;
  durationHours?: number | null;
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedEngineer?: { firstName: string } | null;
  pincode?: { code: string; regionName: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  ASSIGNED: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  IN_PROGRESS: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  PENDING_OTP: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  CLOSED: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
};

export default function TicketsTab() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter === "ALL" ? "/api/tickets" : `/api/tickets?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (res.ok) setTickets(data.tickets);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Count by status
  const counts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleExport = () => {
    window.open("/api/admin/export/tickets", "_blank");
  };

  const displayed = statusFilter === "ALL" ? tickets : tickets.filter(t => t.status === statusFilter);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
          <Ticket className="w-5 h-5" /> Tickets ({tickets.length})
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-content-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
            className={`p-3 rounded-2xl border text-center transition-all ${
              statusFilter === s
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card hover:border-primary/40"
            }`}
          >
            <p className="text-xl font-bold text-content dark:text-content-dark">{counts[s] || 0}</p>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{s.replace(/_/g, " ")}</p>
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : displayed.length === 0 ? (
        <p className="text-center py-12 text-content-secondary text-sm">No tickets found</p>
      ) : (
        <div className="space-y-2">
          {displayed.map(t => (
            <div key={t.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-content dark:text-content-dark">{t.ticketNumber}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-xs text-content-secondary">
                  {t.ageHours != null ? `${t.ageHours}h old` : ""}
                </span>
              </div>
              <p className="text-sm text-content dark:text-content-dark line-clamp-2 mb-1">
                {t.problemDescription}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-secondary dark:text-content-dark-secondary">
                {t.customer && <span>Customer: {t.customer.firstName}</span>}
                {t.assignedEngineer && <span>Engineer: {t.assignedEngineer.firstName}</span>}
                {t.pincode && <span>Pincode: {t.pincode.code}</span>}
                {t.machineSerialNumber && <span>Serial: {t.machineSerialNumber}</span>}
                {t.responseTimeHours != null && <span>Response: {t.responseTimeHours}h</span>}
                {t.durationHours != null && <span>Duration: {t.durationHours}h</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
