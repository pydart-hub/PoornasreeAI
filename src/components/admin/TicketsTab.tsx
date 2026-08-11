"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Ticket, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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
  pincode?: { code: string; place?: string | null; district?: string | null; state?: string | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/50",
  ASSIGNED: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/50",
  IN_PROGRESS: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/50",
  PENDING_OTP: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200/80 dark:border-orange-800/50",
  CLOSED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/50",
};

export default function TicketsTab() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

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

  const displayed = useMemo(() => {
    let list = statusFilter === "ALL" ? tickets : tickets.filter(t => t.status === statusFilter);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(t =>
      t.ticketNumber.toLowerCase().includes(q) ||
      t.problemDescription.toLowerCase().includes(q) ||
      (t.customer && (t.customer.firstName.toLowerCase().includes(q) || t.customer.email.toLowerCase().includes(q))) ||
      (t.assignedEngineer && t.assignedEngineer.firstName.toLowerCase().includes(q)) ||
      (t.machineSerialNumber && t.machineSerialNumber.toLowerCase().includes(q))
    );
  }, [tickets, statusFilter, search]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Support Tickets
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {displayed.length} of {tickets.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Service requests, field engineer assignments, and resolution status.
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors self-start sm:self-auto shadow-xs"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_OTP", "CLOSED"] as const).map(s => {
          const isSelected = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
              className={cn(
                "p-3 rounded-xl border text-center transition-all duration-150",
                isSelected
                  ? "border-primary bg-primary-50/50 dark:bg-primary-950/50 ring-2 ring-primary/30"
                  : "border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300",
              )}
            >
              <p className="text-xl font-black text-slate-900 dark:text-white">{counts[s] || 0}</p>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{s.replace(/_/g, " ")}</p>
            </button>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket #, customer, problem description, engineer, serial #…"
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          <Ticket className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No tickets found</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing filters or search query.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(t => (
            <div key={t.id} className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white bg-slate-200/80 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                    {t.ticketNumber}
                  </span>
                  <span className={cn("text-xs font-bold px-2.5 py-0.5 rounded-lg border", STATUS_COLORS[t.status] || "bg-slate-100 text-slate-700")}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {t.ageHours != null ? `${t.ageHours}h ago` : ""}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                {t.problemDescription}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {t.customer && <span>Customer: <strong className="font-semibold text-slate-700 dark:text-slate-300">{t.customer.firstName}</strong></span>}
                {t.assignedEngineer && <span>Engineer: <strong className="font-semibold text-slate-700 dark:text-slate-300">{t.assignedEngineer.firstName}</strong></span>}
                {t.pincode && <span>Pincode: <strong>{t.pincode.code}</strong></span>}
                {t.machineSerialNumber && <span>Serial #: <strong>{t.machineSerialNumber}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
