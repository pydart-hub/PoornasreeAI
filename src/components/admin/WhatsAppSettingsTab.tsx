"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Save, Phone, Mail, Clock } from "lucide-react";

interface SupportSettings {
  supportPhone: string;
  supportEmail: string | null;
  supportHours: string | null;
  supportNote: string | null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function WhatsAppSettingsTab() {
  const [form, setForm] = useState({
    supportPhone: "",
    supportEmail: "",
    supportHours: "",
    supportNote: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ settings: SupportSettings }>("/api/admin/chatbot-settings");
      const s = data.settings;
      setForm({
        supportPhone: s.supportPhone ?? "",
        supportEmail: s.supportEmail ?? "",
        supportHours: s.supportHours ?? "",
        supportNote: s.supportNote ?? "",
      });
    } catch {
      setError("Failed to load settings");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!form.supportPhone.trim()) {
      setError("Phone number is required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch("/api/admin/chatbot-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supportPhone: form.supportPhone.trim(),
          supportEmail: form.supportEmail.trim() || null,
          supportHours: form.supportHours.trim() || null,
          supportNote: form.supportNote.trim() || null,
        }),
      });
      setSuccess("Support contact details saved. Customers will see these in Speak to Support.");
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
          <MessageSquare className="w-5 h-5" /> WhatsApp — Speak to Support
        </h2>
        <p className="text-sm text-content-secondary dark:text-content-dark-secondary mt-1">
          Contact details shown when a customer selects <strong>Speak to Support</strong> in the chatbot menu.
        </p>
      </div>

      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-4">
        <div>
          <label className="text-xs font-medium text-content-secondary flex items-center gap-1">
            <Phone className="w-3 h-3" /> Phone number *
          </label>
          <input
            type="text"
            value={form.supportPhone}
            onChange={e => setForm(f => ({ ...f, supportPhone: e.target.value }))}
            placeholder="e.g. +91 94009 61291"
            className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-content-secondary flex items-center gap-1">
            <Mail className="w-3 h-3" /> Email (optional)
          </label>
          <input
            type="email"
            value={form.supportEmail}
            onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))}
            placeholder="support@poornasree.com"
            className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-content-secondary flex items-center gap-1">
            <Clock className="w-3 h-3" /> Business hours (optional)
          </label>
          <input
            type="text"
            value={form.supportHours}
            onChange={e => setForm(f => ({ ...f, supportHours: e.target.value }))}
            placeholder="e.g. Mon–Sat, 9 AM – 6 PM"
            className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-content-secondary">Extra note (optional)</label>
          <textarea
            value={form.supportNote}
            onChange={e => setForm(f => ({ ...f, supportNote: e.target.value }))}
            rows={3}
            placeholder="e.g. For urgent issues, call during business hours."
            className="w-full mt-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {success && <p className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save contact details
        </button>
      </div>

      <div className="p-4 rounded-2xl border border-dashed border-line dark:border-line-dark bg-surface-tertiary/50 dark:bg-surface-dark-tertiary/30">
        <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Preview (WhatsApp)</p>
        <pre className="text-sm text-content dark:text-content-dark whitespace-pre-wrap font-sans">
{`📞 *Speak to Support*

${form.supportPhone.trim() ? `📞 *Phone:* ${form.supportPhone.trim()}` : ""}${form.supportEmail.trim() ? `\n✉️ *Email:* ${form.supportEmail.trim()}` : ""}${form.supportHours.trim() ? `\n🕐 *Hours:* ${form.supportHours.trim()}` : ""}${form.supportNote.trim() ? `\n${form.supportNote.trim()}` : ""}

Our support team will reach out to you shortly.`}
        </pre>
      </div>
    </section>
  );
}
