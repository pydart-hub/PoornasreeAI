"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, Pencil, BookOpen, X, Check } from "lucide-react";

interface TroubleshootingStep {
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
  steps: TroubleshootingStep[];
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

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ problemType: "", title: "", description: "", steps: [""] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ templates: Template[] }>("/api/admin/templates");
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
        body: JSON.stringify({ ...form, steps }),
      });
      setForm({ problemType: "", title: "", description: "", steps: [""] });
      fetchTemplates();
    } catch (e: any) {
      setError(e.message);
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

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditSteps(t.steps.map(s => s.stepContent));
  };

  const saveEdit = async (id: string) => {
    const steps = editSteps.filter(s => s.trim());
    if (steps.length === 0) return;
    try {
      await apiFetch(`/api/admin/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle, steps }),
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
                    <span className={`ml-2 ${t.isActive ? "text-emerald-600" : "text-red-500"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
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
