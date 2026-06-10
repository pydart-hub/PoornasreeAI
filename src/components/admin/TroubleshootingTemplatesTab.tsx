"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, Pencil, Plus, ChevronDown, ChevronUp, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface TroubleshootingStep {
  id: string;
  stepNumber: number;
  stepContent: string;
}

interface TroubleshootingTemplate {
  id: string;
  problemType: string;
  title: string;
  description: string | null;
  isActive: boolean;
  audience: string;
  steps: TroubleshootingStep[];
}

export default function TroubleshootingTemplatesTab() {
  const [templates, setTemplates] = useState<TroubleshootingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingTemplate, setEditingTemplate] = useState<TroubleshootingTemplate | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    problemType: "",
    title: "",
    description: "",
    audience: "customer",
    isActive: true,
    steps: [""]
  });

  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/templates", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleEdit = (t: TroubleshootingTemplate) => {
    setEditingTemplate(t);
    setIsAdding(false);
    setFormData({
      problemType: t.problemType,
      title: t.title,
      description: t.description || "",
      audience: t.audience,
      isActive: t.isActive,
      steps: t.steps.length > 0 ? t.steps.map(s => s.stepContent) : [""]
    });
    setFormError("");
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingTemplate(null);
    setFormData({
      problemType: "",
      title: "",
      description: "",
      audience: "customer",
      isActive: true,
      steps: [""]
    });
    setFormError("");
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingTemplate(null);
    setFormError("");
  };

  const handleSave = async () => {
    setFormError("");
    if (!formData.problemType || !formData.title || !formData.steps.some(s => s.trim())) {
      setFormError("Problem type, title, and at least one step are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        steps: formData.steps.filter(s => s.trim() !== "")
      };

      const url = editingTemplate ? `/api/admin/templates/${editingTemplate.id}` : "/api/admin/templates";
      const method = editingTemplate ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save template");
        return;
      }

      await fetchTemplates();
      handleCancel();
    } catch (err) {
      console.error(err);
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const updateStep = (index: number, val: string) => {
    const newSteps = [...formData.steps];
    newSteps[index] = val;
    setFormData({ ...formData, steps: newSteps });
  };

  const addStep = () => {
    setFormData({ ...formData, steps: [...formData.steps, ""] });
  };

  const removeStep = (index: number) => {
    const newSteps = formData.steps.filter((_, i) => i !== index);
    if (newSteps.length === 0) newSteps.push("");
    setFormData({ ...formData, steps: newSteps });
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-content-secondary dark:text-content-dark-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-content dark:text-content-dark">
            Troubleshooting Data
          </h2>
          <p className="text-sm text-content-secondary dark:text-content-dark-secondary">
            Manage complaints and steps in an Excel-like view.
          </p>
        </div>
        {!isAdding && !editingTemplate && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Complaint
          </button>
        )}
      </div>

      {(isAdding || editingTemplate) && (
        <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-content dark:text-content-dark">
              {isAdding ? "Add New Complaint" : "Edit Complaint"}
            </h3>
            <button onClick={handleCancel} className="p-1 rounded-lg hover:bg-surface-hover dark:hover:bg-surface-dark-hover">
              <X className="w-4 h-4 text-content-secondary" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Problem Type (Unique key) *</label>
              <input
                value={formData.problemType}
                onChange={e => setFormData({ ...formData, problemType: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                disabled={!!editingTemplate}
                placeholder="e.g. power_issue"
                className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Title (Shown to User) *</label>
              <input
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Machine is not turning on"
                className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Audience</label>
              <select
                value={formData.audience}
                onChange={e => setFormData({ ...formData, audience: e.target.value })}
                className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="customer">Customer Only</option>
                <option value="engineer">Engineer Only</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Status</label>
              <div className="flex items-center h-9">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-content dark:text-content-dark">Active</span>
                </label>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Description (Optional)</label>
              <input
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Short description of the issue"
                className="w-full h-9 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-line dark:border-line-dark">
            <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Troubleshooting Steps</label>
            {formData.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 text-center text-xs font-bold text-content-secondary mt-2.5">{i + 1}.</span>
                <textarea
                  value={step}
                  onChange={e => updateStep(i, e.target.value)}
                  placeholder={`Step ${i + 1} instructions`}
                  className="w-full min-h-[40px] py-2 px-3 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm text-content dark:text-content-dark placeholder:text-content-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="flex-shrink-0 p-2 mt-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors ml-8"
            >
              <Plus className="w-3.5 h-3.5" /> Add Step
            </button>
          </div>

          {formError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-2 rounded-xl">
              {formError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isAdding ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Excel-like Table View */}
      <div className="rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-tertiary dark:bg-surface-dark-tertiary border-b border-line dark:border-line-dark text-xs uppercase tracking-wider text-content-secondary dark:text-content-dark-secondary font-semibold">
              <th className="px-4 py-3 min-w-[120px]">Problem Type</th>
              <th className="px-4 py-3 min-w-[200px]">Title</th>
              <th className="px-4 py-3 w-[100px]">Audience</th>
              <th className="px-4 py-3 w-[80px]">Status</th>
              <th className="px-4 py-3 w-[120px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-content-secondary dark:text-content-dark-secondary">
                  No troubleshooting templates found
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <React.Fragment key={t.id}>
                  <tr className="border-b border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors group">
                    <td className="px-4 py-3 text-sm font-medium text-content dark:text-content-dark whitespace-nowrap">
                      {t.problemType}
                    </td>
                    <td className="px-4 py-3 text-sm text-content dark:text-content-dark">
                      {t.title}
                      {t.description && <div className="text-xs text-content-secondary dark:text-content-dark-secondary mt-0.5 truncate max-w-[300px]">{t.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-content-secondary dark:text-content-dark-secondary capitalize">
                      {t.audience}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", t.isActive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")}>
                        {t.isActive ? "Active" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => toggleExpand(t.id)}
                        className="inline-flex items-center p-1.5 mr-1 rounded-lg text-content-secondary hover:bg-surface dark:hover:bg-surface-dark transition-colors"
                        title="View Steps"
                      >
                        {expandedId === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEdit(t)}
                        className="inline-flex items-center p-1.5 mr-1 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit Template"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="inline-flex items-center p-1.5 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  {/* Expanded row for steps */}
                  {expandedId === t.id && (
                    <tr className="bg-surface-hover/50 dark:bg-surface-dark-hover/50 border-b border-line dark:border-line-dark">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="pl-4 border-l-2 border-primary/30 space-y-2">
                          <h4 className="text-xs font-bold text-content-secondary dark:text-content-dark-secondary uppercase tracking-wider mb-2">Steps ({t.steps.length})</h4>
                          {t.steps.length === 0 ? (
                            <p className="text-sm text-content-secondary">No steps defined.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {t.steps.map((s, idx) => (
                                <li key={s.id} className="text-sm text-content dark:text-content-dark flex items-start gap-2">
                                  <span className="font-semibold text-content-secondary min-w-[20px]">{s.stepNumber}.</span>
                                  <span>{s.stepContent}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
