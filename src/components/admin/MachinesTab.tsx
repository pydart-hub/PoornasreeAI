"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, Search, Settings } from "lucide-react";

interface Machine {
  id: string;
  serialNumber: string;
  modelName: string;
  specs?: string | null;
  isActive: boolean;
  createdAt: string;
}

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

export default function MachinesTab() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ serialNumber: "", modelName: "", specs: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ machines: Machine[] }>("/api/admin/machines");
      setMachines(data.machines);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  const handleCreate = async () => {
    if (!form.serialNumber.trim() || !form.modelName.trim()) {
      setError("Serial number and model name are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/admin/machines", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ serialNumber: "", modelName: "", specs: "" });
      fetchMachines();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/machines/${id}`, { method: "DELETE" });
      setMachines(prev => prev.filter(m => m.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const filtered = machines.filter(m =>
    m.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
    m.modelName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
          <Settings className="w-5 h-5" /> Machines ({machines.length})
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
          <input
            type="text"
            placeholder="Search machines..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm w-64"
          />
        </div>
      </div>

      {/* Add machine form */}
      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Add Machine</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Serial Number (e.g. PSR-2024-00001)"
            value={form.serialNumber}
            onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <input
            type="text"
            placeholder="Model Name"
            value={form.modelName}
            onChange={e => setForm(f => ({ ...f, modelName: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <input
            type="text"
            placeholder="Specs (optional)"
            value={form.specs}
            onChange={e => setForm(f => ({ ...f, specs: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Machine
        </button>
      </div>

      {/* Machine list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-content-secondary dark:text-content-dark-secondary text-sm">No machines found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <div key={m.id} className="flex items-center justify-between p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
              <div>
                <p className="text-sm font-medium text-content dark:text-content-dark">{m.serialNumber}</p>
                <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{m.modelName}{m.specs ? ` — ${m.specs}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}>
                  {m.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  className="p-2 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  {deletingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
