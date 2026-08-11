"use client";

import { useState, useMemo } from "react";
import {
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  FileSpreadsheet,
  Clock,
  RefreshCw,
  Pencil,
  Sparkles,
  Wrench,
  Users,
  Search,
  Filter,
} from "lucide-react";
import ExcelEditorModal from "./ExcelEditorModal";
import ManualComplaintsTab from "./ManualComplaintsTab";
import type { ApiDocument } from "./types";
import { cn } from "@/lib/utils";

interface DocumentsTabProps {
  documents: ApiDocument[];
  docsLoading: boolean;
  onFetchDocuments: () => void;
  onHandleFiles: (files: FileList | File[]) => void;
  onHandleDeleteDoc: (id: string) => void;
  onHandleDragOver: (e: React.DragEvent) => void;
  onHandleDragLeave: () => void;
  onHandleDrop: (e: React.DragEvent) => void;
  uploadDocType: "service" | "customer";
  onSetUploadDocType: (t: "service" | "customer") => void;
  uploading: boolean;
  uploadMessage: { text: string; type: "success" | "error" } | null;
  deletingDocId: string | null;
  editingDocId: string | null;
  onSetEditingDocId: (id: string | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dragOver: boolean;
  getRoleBadge?: (role: string) => { label: string; variant: string };
  currentUser?: any;
}

type TargetFilter = "all" | "service" | "customer";
type TypeFilter = "all" | "excel" | "pdf";
type StatusFilter = "all" | "trained" | "pending";

export default function DocumentsTab({
  documents,
  docsLoading,
  onFetchDocuments,
  onHandleFiles,
  onHandleDeleteDoc,
  onHandleDragOver,
  onHandleDragLeave,
  onHandleDrop,
  uploadDocType,
  onSetUploadDocType,
  uploading,
  uploadMessage,
  deletingDocId,
  editingDocId,
  onSetEditingDocId,
  fileInputRef,
  dragOver,
}: DocumentsTabProps) {
  // Document List Filters State
  const [docSearch, setDocSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Target Filter
      if (targetFilter !== "all" && doc.documentType !== targetFilter) {
        return false;
      }
      // Status Filter
      if (statusFilter !== "all" && doc.status !== statusFilter) {
        return false;
      }
      // Type Filter
      const isExcel = doc.filePath && (doc.filePath.endsWith(".xlsx") || doc.filePath.endsWith(".xls"));
      if (typeFilter === "excel" && !isExcel) return false;
      if (typeFilter === "pdf" && isExcel) return false;

      // Search Query
      if (!docSearch) return true;
      const q = docSearch.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.uploadedBy && doc.uploadedBy.toLowerCase().includes(q)) ||
        (doc.filePath && doc.filePath.toLowerCase().includes(q))
      );
    });
  }, [documents, docSearch, targetFilter, typeFilter, statusFilter]);

  return (
    <section className="space-y-8">
      {/* ── 1. Upload & AI Training Card ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Header & Target Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary dark:text-primary-400 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Upload &amp; Train Documents
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload files to automatically train and update AI chat knowledge.
              </p>
            </div>
          </div>

          {/* Role selector buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100/90 dark:bg-slate-800/80 p-1.5 rounded-xl">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2">
              Upload target:
            </span>
            {(["service", "customer"] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => onSetUploadDocType(dt)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150",
                  uploadDocType === dt
                    ? "bg-white dark:bg-slate-700 text-primary dark:text-primary-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                )}
              >
                {dt === "service" ? (
                  <Wrench className="w-3.5 h-3.5" />
                ) : (
                  <Users className="w-3.5 h-3.5" />
                )}
                {dt === "service" ? "Service Engineer" : "Customer"}
              </button>
            ))}
          </div>
        </div>

        {/* Dropzone Area */}
        <div
          onDragOver={onHandleDragOver}
          onDragLeave={onHandleDragLeave}
          onDrop={onHandleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative cursor-pointer rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-200",
            dragOver
              ? "border-primary bg-primary-50/50 dark:bg-primary-950/30 scale-[1.005]"
              : "border-slate-200 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary-400/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/40",
          )}
        >
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".pdf,.json,.csv,.txt,.docx,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onHandleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
            {uploading ? (
              <>
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Uploading &amp; embedding document…
                </p>
              </>
            ) : (
              <>
                <div className="p-3.5 rounded-2xl bg-primary-50 dark:bg-primary-950/60 text-primary dark:text-primary-400 ring-4 ring-primary-50/50 dark:ring-primary-950/30">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Click to upload or drag &amp; drop files here
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    PDF, JSON, CSV, TXT, DOCX, XLSX · max 50 MB
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50/80 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Documents automatically vectorized for AI responses</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upload feedback notification */}
        {uploadMessage && (
          <div
            className={cn(
              "flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold transition-all",
              uploadMessage.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50",
            )}
          >
            {uploadMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{uploadMessage.text}</span>
          </div>
        )}
      </div>

      {/* ── 2. Uploaded Documents Card List with Filters ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Uploaded Documents
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredDocuments.length} of {documents.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active knowledge base sources trained for customer and service support.
            </p>
          </div>

          <button
            onClick={onFetchDocuments}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors self-start sm:self-auto"
            title="Refresh document list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", docsLoading && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Filter:
            </span>

            {/* Target Filter */}
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value as TargetFilter)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Targets</option>
              <option value="service">Service Engineer</option>
              <option value="customer">Customer</option>
            </select>

            {/* File Format Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Formats</option>
              <option value="pdf">PDF / Text</option>
              <option value="excel">Excel (.xlsx)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="trained">Trained</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative shrink-0 md:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search document title…"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {docsLoading && documents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No matching documents found
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Try adjusting your search query or dropdown filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDocuments.map((doc) => {
              const isExcel =
                doc.filePath &&
                (doc.filePath.endsWith(".xlsx") || doc.filePath.endsWith(".xls"));

              return (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={cn(
                        "p-2.5 rounded-xl shrink-0",
                        isExcel
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
                      )}
                    >
                      {isExcel ? (
                        <FileSpreadsheet className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {doc.title}
                      </p>
                      <div className="flex items-center gap-2.5 mt-1 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(doc.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          by{" "}
                          <strong className="font-semibold text-slate-700 dark:text-slate-300">
                            {doc.uploadedBy}
                          </strong>
                        </span>
                        {doc.chunkCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {doc.chunkCount} chunks
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Badges */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <span
                      className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-lg border",
                        doc.documentType === "service"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/50"
                          : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/50",
                      )}
                    >
                      {doc.documentType === "service" ? "Service" : "Customer"}
                    </span>

                    <span
                      className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                        doc.status === "trained"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/50"
                          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/50",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          doc.status === "trained" ? "bg-emerald-500" : "bg-amber-500 animate-pulse",
                        )}
                      />
                      {doc.status === "trained" ? "Trained" : "Pending"}
                    </span>

                    {isExcel && (
                      <button
                        onClick={() => onSetEditingDocId(doc.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/50 dark:hover:bg-primary-900/60 transition-colors"
                        title="Live Edit Excel Sheet"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      onClick={() => onHandleDeleteDoc(doc.id)}
                      disabled={deletingDocId === doc.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                      title="Delete document"
                    >
                      {deletingDocId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Manual Complaints Section ── */}
      <ManualComplaintsTab />

      {/* Excel Editor Modal */}
      {editingDocId && (
        <ExcelEditorModal
          documentId={editingDocId}
          onClose={() => onSetEditingDocId(null)}
        />
      )}
    </section>
  );
}
