"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Trash2, CheckCircle2, AlertCircle, FileSpreadsheet, Clock, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import ExcelEditorModal from "./ExcelEditorModal";

interface ApiManualComplaint {
  id: string;
  role?: string;
  isEngineer?: boolean;
  machineName: string | null;
  complaint: string;
  isReviewed: boolean;
  createdAt: string;
}

export default function ManualComplaintsTab() {
  const [complaints, setComplaints] = useState<ApiManualComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"customer" | "engineer">("customer");
  const [actionId, setActionId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewed">("all");

  // Modal State
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [prefillRow, setPrefillRow] = useState<string[] | undefined>();

  // Fetch documents to find the correct Excel file ID
  const [documents, setDocuments] = useState<any[]>([]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/documents", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/manual-complaints", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setComplaints(data.complaints);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
    fetchDocuments();
  }, [fetchComplaints, fetchDocuments]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this complaint entry?")) return;
    setActionId(id);
    try {
      await fetch(`/api/admin/manual-complaints/${id}`, { method: "DELETE" });
      setComplaints((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    } finally {
      setActionId(null);
    }
  };

  const handleReview = async (id: string) => {
    setActionId(id);
    try {
      await fetch(`/api/admin/manual-complaints/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isReviewed: true }),
        headers: { "Content-Type": "application/json" }
      });
      setComplaints((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isReviewed: true } : c))
      );
    } catch {
      /* ignore */
    } finally {
      setActionId(null);
    }
  };

  const handleAddToDocument = (c: ApiManualComplaint) => {
    // Determine target document based on role/tab
    const docType = activeTab === "customer" ? "customer" : "service";
    const targetDocs = documents.filter(d => 
      d.documentType === docType && 
      d.filePath && (d.filePath.endsWith(".xlsx") || d.filePath.endsWith(".xls"))
    );

    if (targetDocs.length === 0) {
      alert(`No Excel document found for ${docType}s. Please upload an Excel file first.`);
      return;
    }

    // Default to the most recently uploaded one
    const targetDoc = targetDocs[0];
    
    // Determine prefill row format based on document title
    let row: string[] = [];
    if (targetDoc.title.includes("CHATBOT_DATAS")) {
       // Tag, Patterns, Responses
       const tag = c.complaint.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 30);
       row = [tag, c.complaint, ""];
    } else {
       // Engineer Training typically has SI.NO, PRODUCT, COMPLAINT, ...
       row = ["", c.machineName || "", c.complaint, "", "", "", ""];
    }

    setSelectedDocId(targetDoc.id);
    setPrefillRow(row);
    setShowExcelModal(true);

    // Also mark as reviewed
    if (!c.isReviewed) {
      handleReview(c.id);
    }
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // Role filter
      const matchesRole = activeTab === "customer" ? !c.isEngineer : !!c.isEngineer;
      if (!matchesRole) return false;

      // Status filter
      if (statusFilter === "pending" && c.isReviewed) return false;
      if (statusFilter === "reviewed" && !c.isReviewed) return false;

      // Search query
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.machineName && c.machineName.toLowerCase().includes(q)) ||
        c.complaint.toLowerCase().includes(q)
      );
    });
  }, [complaints, activeTab, statusFilter, search]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Manual Complaints
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Complaints manually entered by users when the chatbot couldn't find a solution.
          </p>
        </div>

        {/* Audience filter tabs */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl self-start sm:self-auto">
          {(["customer", "engineer"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150",
                activeTab === tab
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              {tab === "customer" ? "Customers" : "Engineers"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Status:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">All Complaints</option>
            <option value="pending">Pending Review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>

        <div className="relative shrink-0 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search machine name or complaint…"
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* List Container */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No manual complaints found
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search terms or status filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredComplaints.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold">
                      {c.machineName || "General Complaint"}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(c.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                    {c.complaint}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {c.isReviewed ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 px-2.5 py-1 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 px-2.5 py-1 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5" /> Pending Review
                    </span>
                  )}

                  {!c.isReviewed && (
                    <button
                      onClick={() => handleAddToDocument(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/50 dark:hover:bg-primary-900/60 text-primary text-xs font-bold transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Add to Document</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={actionId === c.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                    title="Delete complaint"
                  >
                    {actionId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showExcelModal && selectedDocId && (
        <ExcelEditorModal
          documentId={selectedDocId}
          initialRowData={prefillRow}
          onClose={() => {
            setShowExcelModal(false);
            setSelectedDocId(null);
            setPrefillRow(undefined);
          }}
        />
      )}
    </div>
  );
}
