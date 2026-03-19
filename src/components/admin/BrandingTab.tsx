"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Palette, Upload } from "lucide-react";

interface Branding {
  id: string;
  companyName: string;
  logoUrl?: string | null;
  address?: string | null;
  primaryColor: string;
  tagline?: string | null;
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

export default function BrandingTab() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ companyName: "", address: "", primaryColor: "#2563eb", tagline: "" });
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchBranding = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ branding: Branding }>("/api/branding");
      setBranding(data.branding);
      if (data.branding) {
        setForm({
          companyName: data.branding.companyName || "",
          address: data.branding.address || "",
          primaryColor: data.branding.primaryColor || "#2563eb",
          tagline: data.branding.tagline || "",
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ branding: Branding }>("/api/admin/branding", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setBranding(data.branding);
      setMessage({ text: "Branding updated successfully", type: "success" });
    } catch (e: any) {
      setMessage({ text: e.message, type: "error" });
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/admin/branding/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setBranding(data.branding);
        setMessage({ text: "Logo uploaded", type: "success" });
      } else {
        setMessage({ text: data.error || "Upload failed", type: "error" });
      }
    } catch {
      setMessage({ text: "Upload failed", type: "error" });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
        <Palette className="w-5 h-5" /> Branding
      </h2>

      <div className="p-6 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-4 max-w-xl">
        {/* Logo preview */}
        {branding?.logoUrl && (
          <div className="flex items-center gap-4">
            <img src={branding.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl border border-line dark:border-line-dark" />
            <span className="text-xs text-content-secondary">Current logo</span>
          </div>
        )}

        {/* Logo upload */}
        <div>
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Logo</label>
          <label className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-line dark:border-line-dark cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors w-fit">
            <Upload className="w-4 h-4 text-content-secondary" />
            <span className="text-sm text-content-secondary">Upload logo image</span>
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </label>
        </div>

        {/* Fields */}
        <div>
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Company Name</label>
          <input
            type="text"
            value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Tagline</label>
          <input
            type="text"
            value={form.tagline}
            onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Address</label>
          <textarea
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
            rows={3}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Primary Color</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-line dark:border-line-dark cursor-pointer"
            />
            <input
              type="text"
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm w-32"
            />
          </div>
        </div>

        {message && (
          <p className={`text-xs ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
            {message.text}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Branding
        </button>
      </div>
    </section>
  );
}
