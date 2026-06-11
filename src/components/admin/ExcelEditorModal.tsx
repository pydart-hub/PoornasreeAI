"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Save, Plus, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExcelEditorModalProps {
  documentId: string;
  initialRowData?: string[];
  onClose: () => void;
}

export default function ExcelEditorModal({ documentId, initialRowData, onClose }: ExcelEditorModalProps) {
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExcel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/excel`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Excel file");
      
      const allRows = data.rows as string[][];
      setSheetName(data.sheetName || "Sheet1");
      
      if (allRows.length > 0) {
        setHeaders(allRows[0]);
        let dataRows = allRows.slice(1);
        
        if (initialRowData) {
          // ensure initialRowData matches header length
          const newRow = Array(allRows[0].length).fill("");
          initialRowData.forEach((val, i) => {
             if (i < newRow.length) newRow[i] = val;
          });
          dataRows = [...dataRows, newRow];
        }
        
        setRows(dataRows);
      } else {
        setHeaders(["Column 1", "Column 2", "Column 3"]);
        setRows([["", "", ""]]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [documentId, initialRowData]);

  useEffect(() => {
    fetchExcel();
  }, [fetchExcel]);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) newRows[rowIndex] = Array(headers.length).fill("");
    newRows[rowIndex][colIndex] = value;
    setRows(newRows);
  };

  const handleAddRow = () => {
    setRows([...rows, Array(headers.length).fill("")]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Re-combine headers and rows
      const dataToSave = [headers, ...rows];
      const res = await fetch(`/api/admin/documents/${documentId}/excel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: dataToSave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Excel file");
      
      alert("Excel file saved and AI retrained successfully!");
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface dark:bg-surface-dark w-full max-w-[95vw] h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-line dark:border-line-dark">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
          <div>
            <h2 className="text-lg font-bold text-content dark:text-content-dark flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">📊</span>
              Live Excel Editor
            </h2>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
              Sheet: <span className="font-semibold">{sheetName}</span> • Edit cells directly. Changes overwrite the file and retrain the AI.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save to Server
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900/50 p-4">
          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full border-collapse bg-white dark:bg-surface-dark shadow-sm rounded-xl overflow-hidden ring-1 ring-line dark:ring-line-dark">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="w-12 px-2 py-2 border border-line dark:border-line-dark text-center text-xs font-semibold text-content-secondary">
                      #
                    </th>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 border border-line dark:border-line-dark text-left text-xs font-semibold text-content-secondary dark:text-content-dark-secondary"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                      <td className="px-2 py-2 border border-line dark:border-line-dark text-center text-xs text-content-secondary bg-slate-50 dark:bg-slate-800/20 group-hover:bg-slate-100 dark:group-hover:bg-slate-800/60">
                        {rowIndex + 1}
                      </td>
                      {headers.map((_, colIndex) => (
                        <td
                          key={colIndex}
                          className="p-0 border border-line dark:border-line-dark"
                        >
                          <textarea
                            value={row[colIndex] || ""}
                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                            className="w-full h-full min-h-[40px] px-2 py-1.5 resize-y bg-transparent outline-none focus:ring-2 focus:ring-primary/50 text-xs text-content dark:text-content-dark transition-all"
                            rows={1}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                onClick={handleAddRow}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-dark border border-line dark:border-line-dark text-content-secondary hover:text-content hover:shadow-sm transition-all text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
