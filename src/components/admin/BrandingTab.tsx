"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  Palette,
  Upload,
  Users,
  Plus,
  Trash2,
  FileUp,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  ImageIcon,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Branding {
  id: string;
  companyName: string;
  logoUrl?: string | null;
  address?: string | null;
  primaryColor: string;
  tagline?: string | null;
}

interface MarketingLead {
  id: string;
  name: string;
  phone: string;
  source: string;
  tags?: string | null;
  createdAt: string;
}

interface Campaign {
  id: string;
  title: string;
  imageUrl: string;
  caption?: string | null;
  status: "draft" | "sending" | "sent";
  sentAt?: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  _count: { leads: number };
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

function Msg({ msg }: { msg: { text: string; type: "success" | "error" } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-xs flex items-center gap-1 ${msg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
      {msg.type === "success" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {msg.text}
    </p>
  );
}

// ─────────────────────────────────────────────
// Main Component — tabbed layout
// ─────────────────────────────────────────────
export default function BrandingTab() {
  const [activeSection, setActiveSection] = useState<"branding" | "leads" | "campaigns">("branding");

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-content dark:text-content-dark flex items-center gap-2">
        <Palette className="w-5 h-5" /> Branding & Marketing
      </h2>

      {/* Section tabs */}
      <div className="flex gap-2 border-b border-line dark:border-line-dark pb-1">
        {(["branding", "leads", "campaigns"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-4 py-1.5 text-sm rounded-t-lg font-medium transition-colors
              ${activeSection === s
                ? "bg-primary text-white"
                : "text-content-secondary hover:text-content dark:hover:text-content-dark"}`}
          >
            {s === "branding" ? "Branding" : s === "leads" ? "Marketing Leads" : "Campaigns"}
          </button>
        ))}
      </div>

      {activeSection === "branding"  && <BrandingSection />}
      {activeSection === "leads"     && <LeadsSection />}
      {activeSection === "campaigns" && <CampaignsSection />}
    </section>
  );
}

// ═════════════════════════════════════════════
// Branding Section (original)
// ═════════════════════════════════════════════
function BrandingSection() {
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
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
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
    <div className="p-6 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-4 max-w-xl">
      {branding?.logoUrl && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl border border-line dark:border-line-dark" />
          <span className="text-xs text-content-secondary">Current logo</span>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Logo</label>
        <label className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-line dark:border-line-dark cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors w-fit">
          <Upload className="w-4 h-4 text-content-secondary" />
          <span className="text-sm text-content-secondary">Upload logo image</span>
          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
        </label>
      </div>
      <div>
        <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Company Name</label>
        <input type="text" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Tagline</label>
        <input type="text" value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Address</label>
        <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" rows={3} />
      </div>
      <div>
        <label className="text-xs font-medium text-content-secondary dark:text-content-dark-secondary">Primary Color</label>
        <div className="mt-1 flex items-center gap-3">
          <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
            className="w-10 h-10 rounded-lg border border-line dark:border-line-dark cursor-pointer" />
          <input type="text" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm w-32" />
        </div>
      </div>
      <Msg msg={message} />
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Save Branding
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════
// Leads Section
// ═════════════════════════════════════════════
function LeadsSection() {
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [addForm, setAddForm] = useState({ name: "", phone: "", tags: "" });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ leads: MarketingLead[] }>("/api/admin/branding/leads");
      setLeads(data.leads);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.phone) return;
    setAdding(true); setMessage(null);
    try {
      await apiFetch("/api/admin/branding/leads", { method: "POST", body: JSON.stringify(addForm) });
      setAddForm({ name: "", phone: "", tags: "" });
      setMessage({ text: "Lead added", type: "success" });
      fetchLeads();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/admin/branding/leads/${id}`, { method: "DELETE" }).catch(() => null);
    setLeads(l => l.filter(x => x.id !== id));
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/admin/branding/leads/import", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      if (res.ok) { setMessage({ text: `Imported ${data.imported} leads`, type: "success" }); fetchLeads(); }
      else setMessage({ text: data.error || "Import failed", type: "error" });
    } catch {
      setMessage({ text: "Import failed", type: "error" });
    }
    setImporting(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const csv = "name,phone,tags\nJohn Doe,919876543210,vip\nJane Smith,918765432109,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-line dark:border-line-dark cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors text-sm text-content-secondary">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          Import CSV
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVImport} />
        </label>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line dark:border-line-dark text-sm text-content-secondary hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
          <Download className="w-4 h-4" /> CSV Template
        </button>
        <span className="ml-auto text-xs text-content-secondary">{leads.length} leads</span>
      </div>

      <Msg msg={message} />

      {/* Add single lead */}
      <form onSubmit={handleAdd} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card">
        <p className="text-sm font-medium mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Lead</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input placeholder="Name *" value={addForm.name} required onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
          <input placeholder="Phone (e.g. 919876543210) *" value={addForm.phone} required onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
          <input placeholder="Tags (optional, comma-sep)" value={addForm.tags} onChange={e => setAddForm(f => ({ ...f, tags: e.target.value }))}
            className="px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
        </div>
        <button type="submit" disabled={adding}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Lead
        </button>
      </form>

      {/* Search + table */}
      <div className="space-y-2">
        <input placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-content-secondary py-6 text-center">No leads yet. Import a CSV or add manually.</p>
        ) : (
          <div className="rounded-2xl border border-line dark:border-line-dark overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover dark:bg-surface-dark-hover">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary">Tags</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary">Source</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-line-dark">
                {filtered.map(lead => (
                  <tr key={lead.id} className="hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                    <td className="px-4 py-2 font-medium">{lead.name}</td>
                    <td className="px-4 py-2 text-content-secondary font-mono text-xs">{lead.phone}</td>
                    <td className="px-4 py-2 text-content-secondary text-xs">{lead.tags || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lead.source === "csv" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => handleDelete(lead.id)}
                        className="p-1 rounded-lg text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// Campaigns Section
// ═════════════════════════════════════════════
function CampaignsSection() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [campData, leadData] = await Promise.all([
        apiFetch<{ campaigns: Campaign[] }>("/api/admin/branding/campaigns"),
        apiFetch<{ leads: MarketingLead[] }>("/api/admin/branding/leads"),
      ]);
      setCampaigns(campData.campaigns);
      setLeads(leadData.leads);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !imageFile) return;
    setCreating(true); setMessage(null);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("caption", caption);
      formData.append("leadIds", JSON.stringify(Array.from(selectedLeadIds)));
      formData.append("image", imageFile);
      const res = await fetch("/api/admin/branding/campaigns", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      setMessage({ text: "Campaign created", type: "success" });
      setTitle(""); setCaption(""); setImageFile(null); setImagePreview(null);
      setSelectedLeadIds(new Set()); setShowForm(false);
      fetchAll();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/admin/branding/campaigns/${id}`, { method: "DELETE" }).catch(() => null);
    setCampaigns(c => c.filter(x => x.id !== id));
  };

  const handleSend = async (campaign: Campaign) => {
    if (campaign._count.leads === 0) {
      setMessage({ text: "No leads assigned to this campaign", type: "error" });
      return;
    }
    setSendingId(campaign.id); setMessage(null);
    try {
      const data = await apiFetch<{ message: string; total: number }>(`/api/admin/branding/campaigns/${campaign.id}/send`, { method: "POST" });
      setMessage({ text: `${data.message} — sending to ${data.total} leads`, type: "success" });
      setTimeout(fetchAll, 3000);
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
    setSendingId(null);
  };

  const statusColor: Record<string, string> = {
    draft:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    sending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    sent:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Campaign"}
        </button>
        <button onClick={fetchAll} className="p-2 rounded-xl border border-line dark:border-line-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
          <RefreshCw className="w-4 h-4 text-content-secondary" />
        </button>
        <span className="ml-auto text-xs text-content-secondary">{campaigns.length} campaigns</span>
      </div>

      <Msg msg={message} />

      {/* New campaign form */}
      {showForm && (
        <form onSubmit={handleCreate} className="p-5 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card space-y-4">
          <p className="font-medium text-sm">Create WhatsApp Marketing Campaign</p>

          <div>
            <label className="text-xs font-medium text-content-secondary">Campaign Image / Collage *</label>
            <label className="mt-1 flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-line dark:border-line-dark cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
              <ImageIcon className="w-4 h-4 text-content-secondary" />
              <span className="text-sm text-content-secondary">{imageFile ? imageFile.name : "Click to upload image or collage"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} required />
            </label>
            {imagePreview && (
              <div className="mt-2 relative w-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-40 h-28 object-cover rounded-xl border border-line dark:border-line-dark" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-content-secondary">Campaign Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Summer Sale 2026"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-content-secondary">Caption (sent with the image)</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
              placeholder="Exciting new offers from Poornasree! Contact us for details."
              className="mt-1 w-full px-3 py-2 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark text-sm" />
          </div>

          {/* Lead selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-content-secondary">Select Leads ({selectedLeadIds.size} selected)</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedLeadIds(new Set(leads.map(l => l.id)))} className="text-xs text-primary hover:underline">All</button>
                <span className="text-xs text-content-secondary">|</span>
                <button type="button" onClick={() => setSelectedLeadIds(new Set())} className="text-xs text-content-secondary hover:underline">None</button>
              </div>
            </div>
            {leads.length === 0 ? (
              <p className="text-xs text-content-secondary py-3 text-center border border-dashed border-line dark:border-line-dark rounded-xl">
                No leads yet — add leads in the &quot;Marketing Leads&quot; tab first.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-line dark:border-line-dark divide-y divide-line dark:divide-line-dark">
                {leads.map(lead => (
                  <label key={lead.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors">
                    <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={() => toggleLead(lead.id)} className="rounded border-line" />
                    <span className="text-sm font-medium">{lead.name}</span>
                    <span className="text-xs text-content-secondary font-mono">{lead.phone}</span>
                    {lead.tags && <span className="text-xs text-content-secondary">{lead.tags}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={creating || !imageFile || !title}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Campaign
          </button>
        </form>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-content-secondary py-8 text-center">No campaigns yet.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map(camp => (
            <div key={camp.id} className="p-4 rounded-2xl border border-line dark:border-line-dark bg-surface-card dark:bg-surface-dark-card flex gap-4 items-start">
              <div className="w-20 h-14 rounded-xl overflow-hidden border border-line dark:border-line-dark flex-shrink-0 bg-surface-hover dark:bg-surface-dark-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={camp.imageUrl} alt={camp.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{camp.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[camp.status] ?? ""}`}>{camp.status}</span>
                </div>
                {camp.caption && <p className="text-xs text-content-secondary truncate">{camp.caption}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-content-secondary">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{camp._count.leads} leads</span>
                  {camp.status === "sent" && (
                    <>
                      <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" />{camp.sentCount} sent</span>
                      {camp.failedCount > 0 && (
                        <span className="flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" />{camp.failedCount} failed</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {camp.status !== "sent" && (
                  <button onClick={() => handleSend(camp)} disabled={sendingId === camp.id || camp.status === "sending"}
                    title="Send via WhatsApp"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
                    {sendingId === camp.id || camp.status === "sending"
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    Send
                  </button>
                )}
                <button onClick={() => handleDelete(camp.id)}
                  className="p-1.5 rounded-xl text-content-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

