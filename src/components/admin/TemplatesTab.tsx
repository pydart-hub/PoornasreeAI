"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, Pencil, BookOpen, X, Check, Power } from "lucide-react";

interface DocumentIssueStep {
  id: string;
  stepNumber: number;
  stepContent: string;
}

interface Template {
  id: string;
  problemType: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  audience: string;
  steps: DocumentIssueStep[];
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

export default function TemplatesTab({ documentId }: { documentId?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ problemType: "", title: "", description: "", audience: "customer", steps: [""] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editAudience, setEditAudience] = useState("customer");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ templates: Template[] }>(`/api/admin/templates${documentId ? `?documentId=${documentId}` : ""}`);
      setTemplates(data.templates);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = async () => {
    const steps = form.steps.filter(s => s.trim());
    if (!form.problemType.trim() || !form.title.trim() || steps.length === 0) {
      setError("Problem type, title, and at least one step are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify({ ...form, steps, documentId }),
      });
    setForm({ problemType: "", title: "", description: "", audience: "customer", steps: [""] });
      fetchTemplates();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const handleToggleActive = async (t: Template) => {
    setTogglingId(t.id);
    try {
      await apiFetch(`/api/admin/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      setTemplates(prev => prev.map(tm => tm.id === t.id ? { ...tm, isActive: !tm.isActive } : tm));
    } catch { /* ignore */ }
    setTogglingId(null);
  };

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditAudience(t.audience ?? "customer");
    setEditSteps(t.steps.map(s => s.stepContent));
  };

  const saveEdit = async (id: string) => {
    const steps = editSteps.filter(s => s.trim());
    if (steps.length === 0) return;
    try {
      await apiFetch(`/api/admin/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle, audience: editAudience, steps }),
      });
      setEditingId(null);
      fetchTemplates();
    } catch { /* ignore */ }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
        <BookOpen className="w-5 h-5" /> Troubleshooting Templates ({templates.length})
      </h2>

      {/* Create form */}
      <div className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-3">
        <h3 className="text-sm font-semibold text-content dark:text-content-dark">Add Template</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Problem Type (e.g. power_issue)"
            value={form.problemType}
            onChange={e => setForm(f => ({ ...f, problemType: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
          <input
            type="text"
            placeholder="Title (e.g. Power Issue)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          />
        </div>
        <textarea
          placeholder="Description (optional)"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          rows={2}
        />
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary whitespace-nowrap">Audience</label>
          <select
            value={form.audience}
            onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
          >
            <option value="customer">👤 Customer</option>
            <option value="engineer">🔧 Service Engineer</option>
            <option value="both">👥 Both</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Steps</label>
          {form.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-content-secondary w-6">{i + 1}.</span>
              <input
                type="text"
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={e => {
                  const next = [...form.steps];
                  next[i] = e.target.value;
                  setForm(f => ({ ...f, steps: next }));
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm"
              />
              {form.steps.length > 1 && (
                <button onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} className="p-1 text-red-500">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setForm(f => ({ ...f, steps: [...f.steps, ""] }))}
            className="text-xs text-primary hover:underline"
          >
            + Add step
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Template
        </button>
      </div>

      {/* Template list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : templates.length === 0 ? (
        <p className="text-center py-12 text-content-secondary text-sm">No templates found</p>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  {editingId === t.id ? (
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="px-2 py-1 rounded border border-primary text-sm font-medium"
                    />
                  ) : (
                    <p className="text-sm font-medium text-content dark:text-content-dark">{t.title}</p>
                  )}
                  <p className="text-xs text-content-secondary dark:text-content-dark-secondary">
                    {t.problemType} — {t.steps.length} step{t.steps.length !== 1 ? "s" : ""}
                    {" "}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      t.audience === "engineer"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : t.audience === "both"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    }`}>
                      {t.audience === "engineer" ? "🔧 Engineer" : t.audience === "both" ? "👥 Both" : "👤 Customer"}
                    </span>
                    <button
                      onClick={() => handleToggleActive(t)}
                      disabled={togglingId === t.id}
                      className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        t.isActive
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                      } disabled:opacity-50`}
                    >
                      {togglingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                      {t.isActive ? "Active" : "Inactive"}
                    </button>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {editingId === t.id ? (
                    <>
                      <button onClick={() => saveEdit(t.id)} className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-2 rounded-lg text-content-secondary hover:bg-surface-hover">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => startEdit(t)} className="p-2 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="p-2 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Audience edit row when editing */}
              {editingId === t.id && (
                <div className="flex items-center gap-2 pl-2">
                  <label className="text-xs text-content-secondary whitespace-nowrap">Audience:</label>
                  <select
                    value={editAudience}
                    onChange={e => setEditAudience(e.target.value)}
                    className="px-2 py-1 rounded border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-xs"
                  >
                    <option value="customer">👤 Customer</option>
                    <option value="engineer">🔧 Service Engineer</option>
                    <option value="both">👥 Both</option>
                  </select>
                </div>
              )}

              {/* Steps */}
              <div className="pl-2 space-y-1">
                {editingId === t.id
                  ? editSteps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-content-secondary w-5">{i + 1}.</span>
                        <input
                          value={s}
                          onChange={e => {
                            const next = [...editSteps];
                            next[i] = e.target.value;
                            setEditSteps(next);
                          }}
                          className="flex-1 px-2 py-1 rounded border border-line dark:border-line-dark text-xs"
                        />
                        {editSteps.length > 1 && (
                          <button onClick={() => setEditSteps(prev => prev.filter((_, j) => j !== i))} className="text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))
                  : t.steps.map(s => (
                      <p key={s.id} className="text-xs text-content-secondary dark:text-content-dark-secondary">
                        <span className="font-medium text-content dark:text-content-dark">{s.stepNumber}.</span> {s.stepContent}
                      </p>
                    ))
                }
                {editingId === t.id && (
                  <button onClick={() => setEditSteps(prev => [...prev, ""])} className="text-xs text-primary hover:underline">+ Add step</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
