"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

  // Removed JS layout thrashing. We now use pure CSS Grid for auto-resizing textareas!

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) newRows[rowIndex] = Array(headers.length).fill("");
    newRows[rowIndex][colIndex] = value;
    setRows(newRows);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, rowIndex: number, colIndex: number) => {
    // Arrow key navigation for textarea (only if not holding Shift/Ctrl, simple nav)
    if (e.key === "ArrowDown" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById(`cell-${rowIndex + 1}-${colIndex}`)?.focus();
    } else if (e.key === "ArrowUp" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById(`cell-${rowIndex - 1}-${colIndex}`)?.focus();
    }
  };

  const handleAddRow = () => {
    setRows([...rows, Array(headers.length).fill("")]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
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

  // Removed handleInput as we now use CSS grid auto-resizing

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
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 relative">
          {error && (
            <div className="m-4 shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200 sticky left-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="inline-block min-w-max align-middle pb-20 p-4">
              <div className="border-2 border-[#d1d5db] dark:border-[#334155] rounded-none overflow-hidden shadow-sm bg-white dark:bg-[#1e293b]">
                <table className="border-collapse text-sm bg-white dark:bg-[#1e293b]">
                  <thead>
                    <tr>
                      <th className="w-12 bg-blue-600 text-white border border-blue-700 text-center font-bold py-2 select-none sticky top-0 z-20 shadow-sm">
                        #
                      </th>
                      {headers.map((h, i) => (
                        <th
                          key={i}
                          className="min-w-[200px] bg-blue-600 text-white border border-blue-700 text-center px-4 py-2 font-bold select-none sticky top-0 z-20 shadow-sm"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="bg-slate-100 dark:bg-[#0f172a] border border-[#d1d5db] dark:border-[#334155] text-center text-[#64748b] dark:text-[#94a3b8] font-medium select-none sticky left-0 z-10">
                          {rowIndex + 1}
                        </td>
                        {headers.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className="p-0 border border-[#d1d5db] dark:border-[#334155] align-top bg-white dark:bg-[#1e293b]"
                          >
                            <div className="grid w-full h-full">
                              {/* Hidden div stretches the cell height automatically via CSS Grid */}
                              <div className="col-start-1 row-start-1 w-full px-3 py-2 whitespace-pre-wrap invisible pointer-events-none min-h-[40px] break-words text-sm font-inherit">
                                {(row[colIndex] || "") + " "}
                              </div>
                              <textarea
                                id={`cell-${rowIndex}-${colIndex}`}
                                value={row[colIndex] || ""}
                                onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                                className="col-start-1 row-start-1 w-full h-full min-h-[40px] px-3 py-2 bg-transparent text-content dark:text-content-dark outline-none focus:ring-2 focus:ring-[#10b981] focus:bg-emerald-50 dark:focus:bg-emerald-900/20 focus:z-10 relative transition-none resize-none overflow-hidden text-sm"
                                spellCheck="false"
                                rows={1}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleAddRow}
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all text-sm font-bold sticky left-4"
              >
                <Plus className="w-5 h-5" />
                Add Row
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
