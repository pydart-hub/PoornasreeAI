"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { X, Save, Plus, Loader2, AlertCircle } from "lucide-react";
import DataGrid, { textEditor, Column } from "react-data-grid";
import "react-data-grid/lib/styles.css";

interface ExcelEditorModalProps {
  documentId: string;
  initialRowData?: string[];
  onClose: () => void;
}

export default function ExcelEditorModal({ documentId, initialRowData, onClose }: ExcelEditorModalProps) {
  const [rows, setRows] = useState<any[]>([]);
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
        
        // Map string[][] to array of objects for react-data-grid
        const gridRows = dataRows.map((r) => {
          const rowObj: any = {};
          allRows[0].forEach((h, colIndex) => {
            rowObj[String(colIndex)] = r[colIndex] || "";
          });
          return rowObj;
        });

        setRows(gridRows);
      } else {
        const defaultHeaders = ["Column 1", "Column 2", "Column 3"];
        setHeaders(defaultHeaders);
        setRows([
          { "0": "", "1": "", "2": "" }
        ]);
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

  const handleAddRow = () => {
    const newRow: any = {};
    headers.forEach((_, colIndex) => {
      newRow[String(colIndex)] = "";
    });
    setRows([...rows, newRow]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Map back to string[][]
      const stringRows = rows.map((rowObj) => {
        return headers.map((_, colIndex) => String(rowObj[String(colIndex)] || ""));
      });
      
      const dataToSave = [headers, ...stringRows];
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

  const columns = useMemo(() => {
    // We add an index column at the start
    const cols: Column<any>[] = [
      {
        key: "_index",
        name: "#",
        width: 60,
        frozen: true,
        renderCell: (props) => <div className="text-center text-gray-500 font-semibold">{props.rowIdx + 1}</div>
      }
    ];
    
    headers.forEach((h, i) => {
      cols.push({
        key: String(i),
        name: h,
        renderEditCell: textEditor,
        resizable: true,
      });
    });
    return cols;
  }, [headers]);

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
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/50 p-4 min-h-0 overflow-hidden relative">
          {error && (
            <div className="mb-4 shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-hidden rounded-xl border border-line dark:border-line-dark shadow-sm bg-white dark:bg-slate-800">
                <style dangerouslySetInnerHTML={{__html: `
                  .rdg { height: 100%; border: none; --rdg-color: var(--foreground); --rdg-background-color: transparent; --rdg-header-background-color: #f8fafc; --rdg-row-hover-background-color: #f1f5f9; --rdg-selection-color: #059669; }
                  .dark .rdg { --rdg-header-background-color: #1e293b; --rdg-row-hover-background-color: #334155; --rdg-color: #e2e8f0; --rdg-border-color: #334155; }
                  .rdg-cell { padding: 0 12px; font-size: 13px; line-height: 35px; }
                  .rdg-header-cell { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
                `}} />
                <DataGrid
                  columns={columns}
                  rows={rows}
                  onRowsChange={setRows}
                  className="rdg-light h-full"
                  rowHeight={40}
                  headerRowHeight={44}
                />
              </div>

              <div className="shrink-0 mt-4">
                <button
                  onClick={handleAddRow}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-surface-dark border border-line dark:border-line-dark text-content-secondary hover:text-content hover:shadow-sm transition-all text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add Row
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
