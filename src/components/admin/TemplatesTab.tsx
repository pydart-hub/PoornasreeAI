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
  Power,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentIssueStep {
  id: string;
  stepNumber: number;
  stepContent: string;
}

interface Template {
  id: string;
  problemType: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  audience: string;
  steps: DocumentIssueStep[];
  createdAt: string;
}

// Editing state for a cell
interface EditingCell {
  rowId: string;
  field: "problemType" | "title" | "audience" | "steps";
}

// New row being added
interface NewRow {
  problemType: string;
  title: string;
  audience: "customer" | "engineer" | "both";
  stepsText: string;
}

const EMPTY_NEW_ROW: NewRow = { problemType: "", title: "", audience: "customer", stepsText: "" };

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function TemplatesTab({ documentId }: { documentId?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  // Excel-like editing
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // New row
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<NewRow>(EMPTY_NEW_ROW);
  const [savingNew, setSavingNew] = useState(false);
  const newRowIdRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ templates: Template[] }>(`/api/admin/templates${documentId ? `?documentId=${documentId}` : ""}`);
      setTemplates(data.templates);
    } catch { /* ignore */ }
    setLoading(false);
  }, [documentId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      if (editInputRef.current.tagName !== "SELECT") {
        (editInputRef.current as HTMLInputElement).select();
      }
    }
  }, [editingCell]);

  // Focus ID field when adding new row
  useEffect(() => {
    if (isAddingRow && newRowIdRef.current) {
      newRowIdRef.current.focus();
    }
  }, [isAddingRow]);

  const handleCellClick = (rowId: string, field: EditingCell["field"], currentValue: string) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue);
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    const { rowId, field } = editingCell;
    const original = templates.find((t) => t.id === rowId);
    if (!original) return;

    let isChanged = false;
    let payload: any = {};

    if (field === "steps") {
      const oldStepsText = original.steps.map(s => s.stepContent).join("\n");
      if (editValue.trim() !== oldStepsText) {
        isChanged = true;
        payload.steps = editValue.split("\n").map(s => s.trim()).filter(Boolean);
        if (payload.steps.length === 0) {
          alert("A template must have at least one step.");
          return;
        }
      }
    } else {
      if (editValue.trim() !== original[field]) {
        isChanged = true;
        payload[field] = editValue.trim();
        if ((field === "problemType" || field === "title") && !payload[field]) {
          alert("This field cannot be empty.");
          return;
        }
      }
    }

    if (!isChanged) {
      setEditingCell(null);
      return;
    }

    setEditingCell(null);
    setActionId(rowId);

    try {
      await apiFetch(`/api/admin/templates/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      fetchTemplates(); // Re-fetch to get correct step objects
    } catch (e: any) {
      alert(e.message || "Failed to update template");
    } finally {
      setActionId(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && editingCell?.field !== "steps") {
      e.preventDefault();
      handleCellSave();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const handleToggleActive = async (t: Template) => {
    setActionId(t.id);
    try {
      await apiFetch(`/api/admin/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      setTemplates((prev) => prev.map((tm) => (tm.id === t.id ? { ...tm, isActive: !tm.isActive } : tm)));
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    setActionId(id);
    try {
      await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  const handleAddRow = async () => {
    if (!newRow.problemType.trim() || !newRow.title.trim() || !newRow.stepsText.trim()) {
      alert("Problem ID, Title, and at least one Step are required.");
      return;
    }
    const steps = newRow.stepsText.split("\n").map(s => s.trim()).filter(Boolean);
    if (steps.length === 0) {
      alert("Please add at least one step.");
      return;
    }

    setSavingNew(true);
    try {
      await apiFetch("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify({
          problemType: newRow.problemType.trim(),
          title: newRow.title.trim(),
          audience: newRow.audience,
          steps,
          documentId,
        }),
      });
      setNewRow(EMPTY_NEW_ROW);
      setIsAddingRow(false);
      fetchTemplates();
    } catch (e: any) {
      alert(e.message || "Failed to add template.");
    } finally {
      setSavingNew(false);
    }
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    // Only save on enter if we are not in the steps textarea
    if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      handleAddRow();
    } else if (e.key === "Escape") {
      setIsAddingRow(false);
      setNewRow(EMPTY_NEW_ROW);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
              <BookOpen className="w-4 h-4" />
            </span>
            Troubleshooting Templates
          </h2>
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-0.5">
            Spreadsheet view — click any cell to edit steps or titles inline.
          </p>
        </div>
        <button
          onClick={() => {
            setIsAddingRow(true);
            setNewRow(EMPTY_NEW_ROW);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-content-secondary dark:text-content-dark-secondary">
        <span>{templates.length} templates configured</span>
      </div>

      {/* Spreadsheet Table */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 800 }}>
            {/* Header */}
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/60 dark:to-slate-800/40">
                <th className="w-[40px] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark">
                  #
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark" style={{ width: "160px" }}>
                  Problem ID (Internal)
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark" style={{ width: "180px" }}>
                  Display Title
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark" style={{ width: "100px" }}>
                  Audience
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark">
                  Steps (New line = New step)
                </th>
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-r border-line dark:border-line-dark" style={{ width: "90px" }}>
                  Status
                </th>
                <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary border-b border-line dark:border-line-dark" style={{ width: "60px" }}>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {/* New Row Input */}
              {isAddingRow && (
                <tr className="bg-indigo-50/50 dark:bg-indigo-500/5 animate-in fade-in duration-200">
                  <td className="px-3 py-2.5 text-center border-b border-r border-line dark:border-line-dark">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                      ✦
                    </span>
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <input
                      ref={newRowIdRef}
                      value={newRow.problemType}
                      onChange={(e) => setNewRow((r) => ({ ...r, problemType: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="e.g. power_issue"
                      className="w-full h-8 px-2.5 rounded-lg border border-indigo-300 dark:border-indigo-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                    />
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <input
                      value={newRow.title}
                      onChange={(e) => setNewRow((r) => ({ ...r, title: e.target.value }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="e.g. Machine Won't Start"
                      className="w-full h-8 px-2.5 rounded-lg border border-indigo-300 dark:border-indigo-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                    />
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <select
                      value={newRow.audience}
                      onChange={(e) => setNewRow((r) => ({ ...r, audience: e.target.value as "customer" | "engineer" | "both" }))}
                      onKeyDown={handleNewRowKeyDown}
                      className="w-full h-8 px-2 rounded-lg border border-indigo-300 dark:border-indigo-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                    >
                      <option value="customer">👤 Customer</option>
                      <option value="engineer">🔧 Engineer</option>
                      <option value="both">👥 Both</option>
                    </select>
                  </td>
                  <td className="px-1 py-1.5 border-b border-r border-line dark:border-line-dark">
                    <textarea
                      value={newRow.stepsText}
                      onChange={(e) => setNewRow((r) => ({ ...r, stepsText: e.target.value }))}
                      onKeyDown={handleNewRowKeyDown}
                      placeholder="Line 1: Check power cord&#10;Line 2: Turn on switch"
                      rows={2}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-500/30 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 resize-y"
                    />
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-line dark:border-line-dark text-center">
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </td>
                  <td className="px-2 py-2.5 border-b border-line dark:border-line-dark">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={handleAddRow}
                        disabled={savingNew}
                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                        title="Save new row"
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
              {templates.length === 0 && !isAddingRow ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <AlertCircle className="w-10 h-10 text-content-secondary dark:text-content-dark-secondary mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
                      No templates configured yet.
                    </p>
                    <button
                      onClick={() => { setIsAddingRow(true); setNewRow(EMPTY_NEW_ROW); }}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add First Template
                    </button>
                  </td>
                </tr>
              ) : (
                templates.map((t, i) => {
                  const isEditing = (field: EditingCell["field"]) =>
                    editingCell?.rowId === t.id && editingCell.field === field;

                  const stepsText = t.steps.map(s => s.stepContent).join("\n");

                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "group transition-colors",
                        !t.isActive && "opacity-60 bg-surface-hover dark:bg-surface-dark-hover",
                        i % 2 === 0 && t.isActive && "bg-white dark:bg-transparent",
                        i % 2 === 1 && t.isActive && "bg-slate-50/60 dark:bg-slate-800/20"
                      )}
                    >
                      {/* Row number */}
                      <td className="px-3 py-2.5 text-center border-b border-r border-line dark:border-line-dark">
                        <span className="text-[11px] font-mono text-content-secondary dark:text-content-dark-secondary opacity-60">
                          {i + 1}
                        </span>
                      </td>

                      {/* Problem Type */}
                      <td
                        className={cn("px-1 py-1 border-b border-r border-line dark:border-line-dark", !isEditing("problemType") && "cursor-text")}
                        onClick={() => !isEditing("problemType") && handleCellClick(t.id, "problemType", t.problemType)}
                      >
                        {isEditing("problemType") ? (
                          <input
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            className="w-full h-7 px-2 rounded border border-indigo-500/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          />
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className="text-xs text-content-secondary dark:text-content-dark-secondary font-mono bg-surface-tertiary dark:bg-surface-dark-tertiary px-1.5 py-0.5 rounded">
                              {t.problemType}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Display Title */}
                      <td
                        className={cn("px-1 py-1 border-b border-r border-line dark:border-line-dark", !isEditing("title") && "cursor-text")}
                        onClick={() => !isEditing("title") && handleCellClick(t.id, "title", t.title)}
                      >
                        {isEditing("title") ? (
                          <input
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            className="w-full h-7 px-2 rounded border border-indigo-500/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          />
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className="text-xs font-semibold text-content dark:text-content-dark">
                              {t.title}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Audience */}
                      <td
                        className={cn("px-1 py-1 border-b border-r border-line dark:border-line-dark", !isEditing("audience") && "cursor-pointer")}
                        onClick={() => !isEditing("audience") && handleCellClick(t.id, "audience", t.audience)}
                      >
                        {isEditing("audience") ? (
                          <select
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            className="w-full h-7 px-1 rounded border border-indigo-500/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          >
                            <option value="customer">Customer</option>
                            <option value="engineer">Engineer</option>
                            <option value="both">Both</option>
                          </select>
                        ) : (
                          <div className="px-2 py-1 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex items-center">
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              t.audience === "engineer"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : t.audience === "both"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            )}>
                              {t.audience === "engineer" ? "🔧 Engineer" : t.audience === "both" ? "👥 Both" : "👤 Customer"}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Steps */}
                      <td
                        className={cn("px-1 py-1 border-b border-r border-line dark:border-line-dark", !isEditing("steps") && "cursor-text")}
                        onClick={() => !isEditing("steps") && handleCellClick(t.id, "steps", stepsText)}
                      >
                        {isEditing("steps") ? (
                          <textarea
                            ref={(el) => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            rows={Math.max(2, t.steps.length)}
                            className="w-full px-2 py-1.5 rounded border border-indigo-500/50 bg-white dark:bg-surface-dark text-xs text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-y"
                          />
                        ) : (
                          <div className="px-2 py-1.5 rounded hover:bg-white/80 dark:hover:bg-white/5 transition-colors min-h-[28px] flex flex-col gap-0.5">
                            {t.steps.map((s, idx) => (
                              <div key={s.id} className="flex gap-1.5 text-[11px] leading-tight">
                                <span className="text-content-secondary/60 shrink-0 select-none w-3 text-right">{idx + 1}.</span>
                                <span className="text-content dark:text-content-dark">{s.stepContent}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-2 py-2.5 border-b border-r border-line dark:border-line-dark text-center">
                        <button
                          onClick={() => handleToggleActive(t)}
                          disabled={actionId === t.id}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full transition-colors disabled:opacity-50 w-[72px] justify-center cursor-pointer",
                            t.isActive
                              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/30"
                              : "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30"
                          )}
                        >
                          {actionId === t.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Power className="w-3 h-3" />
                          )}
                          {t.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-2.5 border-b border-line dark:border-line-dark">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={actionId === t.id}
                            className="p-1.5 rounded-lg text-content-secondary/40 group-hover:text-content-secondary hover:!text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="Delete template"
                          >
                            {actionId === t.id ? (
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
        {templates.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-800/20 border-t border-line dark:border-line-dark">
            <span className="text-[11px] text-content-secondary dark:text-content-dark-secondary">
              {templates.filter((t) => t.isActive).length} of {templates.length} active
            </span>
            <span className="text-[10px] text-content-secondary/50 dark:text-content-dark-secondary/50">
              Click any cell to edit • Enter to save (except steps) • Esc to cancel
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
