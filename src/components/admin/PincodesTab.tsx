"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, MapPin, UserPlus, Shield, Wrench, Save, X } from "lucide-react";

interface SimpleUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  role: string;
}

interface Pincode {
  id: string;
  code: string;
  regionName: string;
  managerId?: string | null;
  manager?: SimpleUser | null;
  engineers?: SimpleUser[];
  users: SimpleUser[];
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  // Edit state for manager/engineers
  const [editManagerId, setEditManagerId] = useState<string>("");
  const [editEngineerIds, setEditEngineerIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  // Legacy assign
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fetchingRegion, setFetchingRegion] = useState(false);

  // Auto-fetch region name from India Pincode API when 6 digits entered
  useEffect(() => {
    const code = form.code.trim();
    if (!/^\d{6}$/.test(code)) return;
    let cancelled = false;
    setFetchingRegion(true);
    fetch(`https://api.postalpincode.in/pincode/${code}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (
          Array.isArray(data) &&
          data[0]?.Status === "Success" &&
          Array.isArray(data[0]?.PostOffice) &&
          data[0].PostOffice.length > 0
        ) {
          const po = data[0].PostOffice[0];
          const region = [po.Name, po.District, po.State].filter(Boolean).join(", ");
          setForm(f => ({ ...f, regionName: region }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchingRegion(false); });
    return () => { cancelled = true; };
  }, [form.code]);

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
      setAllUsers(data.users);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPincodes(); fetchUsers(); }, [fetchPincodes, fetchUsers]);

  const managers = allUsers.filter(u => u.role === "service_manager");
  const engineerUsers = allUsers.filter(u => u.role === "service_engineer");

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
    } catch (e) {
      setError((e as Error).message);
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

  const startEditing = (p: Pincode) => {
    setEditingId(p.id);
    setEditManagerId(p.manager?.id || "");
    setEditEngineerIds(p.engineers?.map(e => e.id) || []);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditManagerId("");
    setEditEngineerIds([]);
  };

  const handleSaveAssignments = async (pincodeId: string) => {
    setSavingEdit(true);
    try {
      await apiFetch(`/api/admin/pincodes/${pincodeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          managerId: editManagerId || null,
          engineerIds: editEngineerIds,
        }),
      });
      cancelEditing();
      fetchPincodes();
    } catch (e) {
      setError((e as Error).message);
    }
    setSavingEdit(false);
  };

  const toggleEngineer = (engineerId: string) => {
    setEditEngineerIds(prev =>
      prev.includes(engineerId)
        ? prev.filter(id => id !== engineerId)
        : [...prev, engineerId]
    );
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
            inputMode="numeric"
            maxLength={6}
            placeholder="Pincode (e.g. 600001)"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <div className="relative">
            <input
              type="text"
              placeholder={fetchingRegion ? "Fetching region..." : "Region Name (e.g. Chennai Central)"}
              value={form.regionName}
              onChange={e => setForm(f => ({ ...f, regionName: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
            {fetchingRegion && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
            )}
          </div>
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
          {pincodes.map(p => {
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-content dark:text-content-dark">{p.code} — {p.regionName}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {p.manager && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Manager: {p.manager.firstName} {p.manager.lastName ?? ""}
                        </span>
                      )}
                      {(p.engineers ?? []).length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> {(p.engineers ?? []).length} engineer{(p.engineers ?? []).length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {p.users.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {p.users.length} legacy user{p.users.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing ? (
                      <button
                        onClick={() => startEditing(p)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Edit Assignments
                      </button>
                    ) : (
                      <button
                        onClick={cancelEditing}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setAssigningId(assigningId === p.id ? null : p.id)}
                      className="p-2 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Legacy assign user"
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

                {/* Engineers list */}
                {!isEditing && (p.engineers ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(p.engineers ?? []).map(u => (
                      <span key={u.id} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary dark:bg-primary-400/10 dark:text-primary-300">
                        {u.firstName} {u.lastName ?? ""}
                      </span>
                    ))}
                  </div>
                )}

                {/* Edit assignments panel */}
                {isEditing && (
                  <div className="space-y-3 pt-3 border-t border-line dark:border-line-dark">
                    {/* Manager select */}
                    <div>
                      <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1 block">
                        Service Manager
                      </label>
                      <select
                        value={editManagerId}
                        onChange={e => setEditManagerId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                      >
                        <option value="">No manager assigned</option>
                        {managers.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.firstName} {m.lastName ?? ""} — {m.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Engineer multi-select */}
                    <div>
                      <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary mb-1 block">
                        Service Engineers ({editEngineerIds.length} selected)
                      </label>
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
                        {engineerUsers.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-content-secondary">No service engineers found</p>
                        ) : (
                          engineerUsers.map(eng => (
                            <label
                              key={eng.id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover dark:hover:bg-surface-dark-hover cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={editEngineerIds.includes(eng.id)}
                                onChange={() => toggleEngineer(eng.id)}
                                className="rounded border-line accent-primary"
                              />
                              <span className="text-content dark:text-content-dark">
                                {eng.firstName} {eng.lastName ?? ""}
                              </span>
                              <span className="text-xs text-content-secondary ml-auto">{eng.email}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveAssignments(p.id)}
                      disabled={savingEdit}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Assignments
                    </button>
                  </div>
                )}

                {/* Legacy assign form */}
                {assigningId === p.id && !isEditing && (
                  <div className="flex items-center gap-2 pt-2 border-t border-line dark:border-line-dark">
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
                    >
                      <option value="">Select user to assign...</option>
                      {allUsers
                        .filter(u => ["service_engineer", "service", "dealer", "service_manager"].includes(u.role))
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
            );
          })}
        </div>
      )}
    </section>
  );
}
