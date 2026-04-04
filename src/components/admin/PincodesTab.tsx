"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, MapPin } from "lucide-react";

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
  place?: string | null;
  district?: string | null;
  state?: string | null;
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
  const [form, setForm] = useState({ code: "", place: "", district: "", state: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
          setForm(f => ({ ...f, place: f.place || po.Name || "", district: f.district || po.District || "", state: f.state || po.State || "" }));
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

  useEffect(() => { fetchPincodes(); }, [fetchPincodes]);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      setError("Pincode is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/admin/pincodes", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", place: "", district: "", state: "" });
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
              placeholder={fetchingRegion ? "Fetching place..." : "Place (e.g. Chennai Central)"}
              value={form.place}
              onChange={e => setForm(f => ({ ...f, place: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            />
            {fetchingRegion && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
            )}
          </div>
          <input
            type="text"
            placeholder="District"
            value={form.district}
            onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <input
            type="text"
            placeholder="State"
            value={form.state}
            onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
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
          {pincodes.map(p => {
            return (
              <div key={p.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-content dark:text-content-dark">
                      {p.code}{p.place ? ` — ${p.place}` : ""}
                    </p>
                    {(p.district || p.state) && (
                      <p className="text-xs text-content-secondary mt-0.5">{[p.district, p.state].filter(Boolean).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="p-2 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
