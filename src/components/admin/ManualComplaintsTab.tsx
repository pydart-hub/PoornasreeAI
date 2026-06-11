"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Save,
  X,
  Download,
  Search,
  BookPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiManualComplaint {
  id: string;
  phoneNumber: string;
  machineName: string | null;
  complaint: string;
  isReviewed: boolean;
  hasMatch: boolean;
  isEngineer?: boolean;
  createdAt: string;
}

// Editing state for a cell
interface EditingCell {
  rowId: string;
  field: "phoneNumber" | "machineName" | "complaint";
}

// New row being added
interface NewRow {
  phoneNumber: string;
  machineName: string;
  complaint: string;
}

const EMPTY_NEW_ROW: NewRow = { phoneNumber: "", machineName: "", complaint: "" };

export default function ManualComplaintsTab() {
  const [complaints, setComplaints] = useState<ApiManualComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"customer" | "engineer">("customer");
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Excel-like editing
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // New row
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<NewRow>(EMPTY_NEW_ROW);
  const [savingNew, setSavingNew] = useState(false);
  const newRowPhoneRef = useRef<HTMLInputElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<"createdAt" | "phoneNumber" | "complaint">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/manual-complaints", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // Focus phone field when adding new row
  useEffect(() => {
    if (isAddingRow && newRowPhoneRef.current) {
      newRowPhoneRef.current.focus();
    }
  }, [isAddingRow]);

  const handleCellClick = (rowId: string, field: EditingCell["field"], currentValue: string) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue);
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    const { rowId, field } = editingCell;
    const original = complaints.find((c) => c.id === rowId);
    if (!original) return;

    const originalValue = original[field] ?? "";
    if (editValue.trim() === originalValue) {
      setEditingCell(null);
      return;
    }

    // Optimistic update
    setComplaints((prev) =>
      prev.map((c) => (c.id === rowId ? { ...c, [field]: editValue.trim() || null } : c))
    );
    setEditingCell(null);

    try {
      const res = await fetch(`/api/admin/manual-complaints/${rowId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: editValue.trim() }),
      });
      if (!res.ok) {
        // Revert on error
        setComplaints((prev) =>
          prev.map((c) => (c.id === rowId ? { ...c, [field]: originalValue } : c))
        );
      }
    } catch {
      setComplaints((prev) =>
        prev.map((c) => (c.id === rowId ? { ...c, [field]: originalValue } : c))
      );
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCellSave();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const handleReview = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/manual-complaints/${id}/review`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        setComplaints((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isReviewed: true } : c))
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const handleConvertToTemplate = async (c: ApiManualComplaint) => {
    if (!confirm("Create a new Troubleshooting Template from this complaint?")) return;
    
    setActionId(c.id);
    try {
      const problemType = c.complaint
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .substring(0, 40) || `issue_${Date.now()}`;
        
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemType,
          title: c.complaint.substring(0, 100),
          audience: activeTab === "engineer" ? "engineer" : "customer",
          steps: ["Enter troubleshooting steps here..."],
        }),
      });

      if (res.ok) {
        await handleReview(c.id);
        alert("Template created! Switch to the Templates view to add steps.");
      } else {
        throw new Error("Failed to create template.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to convert to template.");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this complaint entry?")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/manual-complaints/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setComplaints((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setActionId(null);
    }
  };

  const handleAddRow = async () => {
    if (!newRow.phoneNumber.trim() || !newRow.complaint.trim()) {
      alert("Phone number and complaint are required.");
      return;
    }
    setSavingNew(true);
    try {
      const res = await fetch("/api/admin/manual-complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRow),
      });
      if (res.ok) {
        const data = await res.json();
        setComplaints((prev) => [data.complaint, ...prev]);
        setNewRow(EMPTY_NEW_ROW);
        setIsAddingRow(false);
      } else {
        const errData = await res.json().catch(() => null);
        alert(errData?.error || "Failed to add entry.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSavingNew(false);
    }
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddRow();
    } else if (e.key === "Escape") {
      setIsAddingRow(false);
      setNewRow(EMPTY_NEW_ROW);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/admin/manual-complaints/scan", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Auto-scan complete! Resolved ${data.matchCount} complaints that matched existing customer documents.`);
        fetchComplaints();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to run auto-scan.");
    } finally {
      setScanning(false);
    }
  };

  const handleExportCSV = () => {
    const rows = visibleComplaints.map((c) => ({
      "Phone Number": c.phoneNumber,
      "Machine Name": c.machineName || "",
      "Complaint": c.complaint,
      "Status": c.isReviewed ? "Reviewed" : "Pending",
      "Date": new Date(c.createdAt).toLocaleDateString("en-IN"),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${String((r as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual-complaints-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Filter + sort
  const visibleComplaints = complaints
    .filter((c) => !c.hasMatch && (activeTab === "customer" ? !c.isEngineer : c.isEngineer))
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.complaint.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q) ||
        (c.machineName?.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "createdAt") {
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      return dir * aVal.localeCompare(bVal);
    });

  if (loading && complaints.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
      </div>
    );
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <span className="inline-flex flex-col ml-1 leading-none text-[9px] -space-y-px opacity-50">
      <span className={cn(sortField === field && sortDir === "asc" && "text-primary opacity-100")}>▲</span>
      <span className={cn(sortField === field && sortDir === "desc" && "text-primary opacity-100")}>▼</span>
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs">
              📋
            </span>
            Manual Complaints
          </h2>
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-0.5">
            Spreadsheet view — click any cell to edit, add new rows below.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setIsAddingRow(true);
              setNewRow(EMPTY_NEW_ROW);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
          {visibleComplaints.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-xl transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/20"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Auto-Scan
          </button>
        </div>
      </div>

      {/* Tab switcher + Search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 p-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-xl">
          <button
            onClick={() => setActiveTab("customer")}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              activeTab === "customer"
                ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
            )}
          >
            👤 Customers
          </button>
          <button
            onClick={() => setActiveTab("engineer")}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              activeTab === "engineer"
                ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                : "text-content-secondary dark:text-content-dark-secondary hover:text-content dark:hover:text-content-dark"
            )}
          >
            🔧 Engineers
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary dark:text-content-dark-secondary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search complaints…"
            className="h-8 pl-9 pr-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
          />
        </div>
      </div>

      {/* Row count */}
      <div className="flex items-center gap-3 text-xs text-content-secondary dark:text-content-dark-secondary">
        <span>{visibleComplaints.length} entries</span>
        {searchQuery && <span className="text-primary dark:text-primary-300">• filtered</span>}
      </div>

      {/* Spreadsheet Table */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 720 }}>
            {/* Header */}
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/60 dark:to-slate-800/40">
                <th className="w-[40px] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark">
                  #
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark cursor-pointer hover:text-content dark:hover:text-content-dark select-none"
                  onClick={() => handleSort("phoneNumber")}
                  style={{ width: "140px" }}
                >
                  Phone Number <SortIcon field="phoneNumber" />
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark"
                  style={{ width: "160px" }}
                >
                  Machine Name
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark cursor-pointer hover:text-content dark:hover:text-content-dark select-none"
                  onClick={() => handleSort("complaint")}
                >
                  Complaint / Error <SortIcon field="complaint" />
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark"
                  style={{ width: "90px" }}
                >
                  Status
                </th>
                <th
                  className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark cursor-pointer hover:text-content dark:hover:text-content-dark select-none"
                  onClick={() => handleSort("createdAt")}
                  style={{ width: "100px" }}
                >
                  Date <SortIcon field="createdAt" />
                </th>
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-line dark:border-line-dark" style={{ width: "80px" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {/* New Row Input (appears at top when adding) */}
              {isAddingRow && (
                <tr className="bg-emerald-50/50 dark:bg-emerald-500/5 animate-in fade-in duration-200">
                  <td className="px-3 py-2.5 text-center border-b border-r border-line dark:border-line-dark">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                      ✦
                    </span>
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <input
                      ref={newRowPhoneRef}
                      value={newRow.phoneNumber}
                      onChange={(e) => setNewRow((r) => ({ ...r, phoneNumber: e.target.value }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="e.g. 9876543210"
                      className="w-full h-8 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <input
                      value={newRow.machineName}
                      onChange={(e) => setNewRow((r) => ({ ...r, machineName: e.target.value }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="e.g. VIBRO 200"
                      className="w-full h-8 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <input
                      value={newRow.complaint}
                      onChange={(e) => setNewRow((r) => ({ ...r, complaint: e.target.value }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="Describe the error or complaint…"
                      className="w-full h-8 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    />
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-line dark:border-line-dark text-center">
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      New
                    </span>
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-line dark:border-line-dark text-center text-xs text-content-secondary dark:text-content-dark-secondary">
                    Today
                  </td>
                  <td className="px-2 py-2.5 border-b border-line dark:border-line-dark">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={handleAddRow}
                        disabled={savingNew}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        title="Save new row (Enter)"
                      >
                        {savingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setIsAddingRow(false); setNewRow(EMPTY_NEW_ROW); }}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Cancel (Esc)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data Rows */}
              {visibleComplaints.length === 0 && !isAddingRow ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <AlertCircle className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      No complaints found.
                    </p>
                    <button
                      onClick={() => { setIsAddingRow(true); setNewRow(EMPTY_NEW_ROW); }}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add First Entry
                    </button>
                  </td>
                </tr>
              ) : (
                visibleComplaints.map((c, i) => {
                  const isEditing = (field: EditingCell["field"]) =>
                    editingCell?.rowId === c.id && editingCell.field === field;

                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "group transition-colors",
                        c.isReviewed
                          ? "bg-emerald-50/30 dark:bg-emerald-500/5"
                          : "hover:bg-blue-50/40 dark:hover:bg-blue-500/5",
                        i % 2 === 0 && !c.isReviewed && "bg-white dark:bg-transparent",
                        i % 2 === 1 && !c.isReviewed && "bg-slate-50/60 dark:bg-slate-800/20"
                      )}
                    >
                      {/* Row number */}
                      <td className="px-3 py-2.5 text-center border-b border-r border-line dark:border-line-dark">
                        <span className="text-[11px] font-mono text-content-secondary dark:text-content-dark-secondary opacity-60">
                          {i + 1}
                        </span>
                      </td>

                      {/* Phone Number */}
                      <td
                        className={cn(
                          "px-1 py-1 border-b border-r border-line dark:border-line-dark",
                          !isEditing("phoneNumber") && "cursor-text"
                        )}
                        onClick={() => !isEditing("phoneNumber") && handleCellClick(c.id, "phoneNumber", c.phoneNumber)}
                      >
                        {isEditing("phoneNumber") ? (
                          <input
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            className="w-full h-7 px-2 rounded border border-primary/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className="text-xs text-content dark:text-content-dark font-mono">
                              {c.phoneNumber}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Machine Name */}
                      <td
                        className={cn(
                          "px-1 py-1 border-b border-r border-line dark:border-line-dark",
                          !isEditing("machineName") && "cursor-text"
                        )}
                        onClick={() => !isEditing("machineName") && handleCellClick(c.id, "machineName", c.machineName ?? "")}
                      >
                        {isEditing("machineName") ? (
                          <input
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            className="w-full h-7 px-2 rounded border border-primary/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className={cn("text-xs", c.machineName ? "text-content dark:text-content-dark" : "text-content-secondary/40 dark:text-content-dark-secondary/40 italic")}>
                              {c.machineName || "—"}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Complaint */}
                      <td
                        className={cn(
                          "px-1 py-1 border-b border-r border-line dark:border-line-dark",
                          !isEditing("complaint") && "cursor-text"
                        )}
                        onClick={() => !isEditing("complaint") && handleCellClick(c.id, "complaint", c.complaint)}
                      >
                        {isEditing("complaint") ? (
                          <textarea
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            rows={2}
                            className="w-full px-2 py-1 rounded border border-primary/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                          />
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className="text-xs text-content dark:text-content-dark leading-relaxed line-clamp-2">
                              {c.complaint}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 border-b border-r border-line dark:border-line-dark text-center">
                        {c.isReviewed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Done
                          </span>
                        ) : (
                          <button
                            onClick={() => handleReview(c.id)}
                            disabled={actionId === c.id}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 rounded-full hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {actionId === c.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            Pending
                          </button>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2.5 border-b border-r border-line dark:border-line-dark">
                        <span className="text-[11px] text-content-secondary dark:text-content-dark-secondary whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-2.5 border-b border-line dark:border-line-dark">
                        <div className="flex items-center justify-center gap-1">
                          {!c.isReviewed && (
                            <button
                              onClick={() => handleConvertToTemplate(c)}
                              disabled={actionId === c.id}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                              title="Convert to Template"
                            >
                              <BookPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={actionId === c.id}
                            className="p-1.5 rounded-lg text-content-secondary/40 group-hover:text-content-secondary hover:!text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="Delete entry"
                          >
                            {actionId === c.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {visibleComplaints.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-800/20 border-t border-line dark:border-line-dark">
            <span className="text-[11px] text-content-secondary dark:text-content-dark-secondary">
              {visibleComplaints.filter((c) => c.isReviewed).length} of {visibleComplaints.length} reviewed
            </span>
            <span className="text-[10px] text-content-secondary/50 dark:text-content-dark-secondary/50">
              Click any cell to edit • Enter to save • Esc to cancel
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
