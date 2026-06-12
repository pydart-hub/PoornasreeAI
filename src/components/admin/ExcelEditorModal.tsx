"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Save, Plus, Loader2, AlertCircle } from "lucide-react";
import { DataSheetGrid, textColumn, keyColumn } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";

interface ExcelEditorModalProps {
  documentId: string;
  initialRowData?: string[];
  onClose: () => void;
}

export default function ExcelEditorModal({ documentId, initialRowData, onClose }: ExcelEditorModalProps) {
  const [gridData, setGridData] = useState<any[]>([]);
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
        
        const formattedGrid = dataRows.map(row => {
          const obj: any = {};
          allRows[0].forEach((_, i) => obj[`col_${i}`] = row[i] || "");
          return obj;
        });
        setGridData(formattedGrid);
      } else {
        setHeaders(["Column 1", "Column 2", "Column 3"]);
        setGridData([{ col_0: "", col_1: "", col_2: "" }]);
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const rowsToSave = gridData.map(rowObj => headers.map((_, i) => rowObj[`col_${i}`] || ""));
      const dataToSave = [headers, ...rowsToSave];
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

  const columns = headers.map((header, index) => ({
    ...keyColumn(`col_${index}`, textColumn),
    title: header,
    minWidth: 200,
  }));

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
            <div className="h-full w-full p-4 [&_.dsg-container]:!h-full [&_.dsg-container]:!rounded-xl [&_.dsg-container]:!border-2 [&_.dsg-container]:!border-line [&_.dsg-container]:dark:!border-line-dark">
              <DataSheetGrid
                value={gridData}
                onChange={setGridData}
                columns={columns}
                rowHeight={45}
                addRowsComponent={({ addRows }) => (
                  <button
                    onClick={() => addRows(1)}
                    className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    Add Row
                  </button>
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
