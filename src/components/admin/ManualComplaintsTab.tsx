"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
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

  const filteredComplaints = complaints.filter(
    (c) => activeTab === "customer" 
      ? !c.isEngineer
      : !!c.isEngineer
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark">
            Manual Complaints
          </h2>
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
            Complaints manually entered by users when the chatbot couldn't find a solution.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-xl w-fit">
        {(["customer", "engineer"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-white dark:bg-surface-dark-card text-content dark:text-content-dark shadow-sm"
                : "text-content-secondary hover:text-content dark:text-content-dark-secondary dark:hover:text-content-dark"
            )}
          >
            {tab === "customer" ? "Customers" : "Engineers"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white dark:bg-surface-dark-card rounded-2xl border border-line dark:border-line-dark overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
              No manual complaints found for {activeTab}s.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line dark:divide-line-dark">
            {filteredComplaints.map((c) => (
              <div key={c.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-content dark:text-content-dark">
                      {c.machineName || "Unknown Machine"}
                    </span>
                    <span className="text-[10px] text-content-secondary/60">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                    {c.complaint}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {c.isReviewed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                      <AlertCircle className="w-3 h-3" /> Pending
                    </span>
                  )}

                  {!c.isReviewed && (
                    <button
                      onClick={() => handleAddToDocument(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Add to Document
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={actionId === c.id}
                    className="p-1.5 rounded-lg text-content-secondary/40 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {actionId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
