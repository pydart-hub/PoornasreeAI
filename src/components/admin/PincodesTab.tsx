"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, MapPin, UserPlus } from "lucide-react";

interface Pincode {
  id: string;
  code: string;
  regionName: string;
  users: { id: string; firstName: string; lastName?: string | null; email: string; role: string }[];
}

interface SimpleUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  role: string;
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

export default function PincodesTab() {
  const [pincodes, setPincodes] = useState<Pincode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", regionName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const fetchPincodes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ pincodes: Pincode[] }>("/api/admin/pincodes");
      setPincodes(data.pincodes);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: SimpleUser[] }>("/api/admin/users");
      setAllUsers(data.users.filter(u => ["service_engineer", "service", "dealer", "service_manager"].includes(u.role)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPincodes(); fetchUsers(); }, [fetchPincodes, fetchUsers]);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.regionName.trim()) {
      setError("Pincode and region name are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/admin/pincodes", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", regionName: "" });
      fetchPincodes();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/pincodes/${id}`, { method: "DELETE" });
      fetchPincodes();
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const handleAssign = async (pincodeId: string) => {
    if (!selectedUserId) return;
    try {
      await apiFetch(`/api/admin/pincodes/${pincodeId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ userId: selectedUserId }),
      });
      setAssigningId(null);
      setSelectedUserId("");
      fetchPincodes();
    } catch { /* ignore */ }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
        <MapPin className="w-5 h-5" /> Pincodes ({pincodes.length})
      </h2>

      {/* Add form */}
      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Add Pincode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Pincode (e.g. 600001)"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <input
            type="text"
            placeholder="Region Name (e.g. Chennai Central)"
            value={form.regionName}
            onChange={e => setForm(f => ({ ...f, regionName: e.target.value }))}
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
          Add Pincode
        </button>
      </div>

      {/* Pincode list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : pincodes.length === 0 ? (
        <p className="text-center py-12 text-content-secondary text-sm">No pincodes found</p>
      ) : (
        <div className="space-y-3">
          {pincodes.map(p => (
            <div key={p.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-content dark:text-content-dark">{p.code} — {p.regionName}</p>
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                    {p.users.length} user{p.users.length !== 1 ? "s" : ""} assigned
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAssigningId(assigningId === p.id ? null : p.id)}
                    className="p-2 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Assign user"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={deletingId === p.id}
                    className="p-2 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Assigned users */}
              {p.users.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.users.map(u => (
                    <span key={u.id} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary dark:bg-primary-400/10 dark:text-primary-300">
                      {u.firstName} {u.lastName ?? ""} ({u.role})
                    </span>
                  ))}
                </div>
              )}

              {/* Assign form */}
              {assigningId === p.id && (
                <div className="flex items-center gap-2 pt-2 border-t border-line dark:border-line-dark">
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                  >
                    <option value="">Select user to assign...</option>
                    {allUsers
                      .filter(u => !p.users.some(pu => pu.id === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName ?? ""} ({u.role}) — {u.email}</option>
                      ))
                    }
                  </select>
                  <button
                    onClick={() => handleAssign(p.id)}
                    disabled={!selectedUserId}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
