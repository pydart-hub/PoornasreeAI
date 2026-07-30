"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Save,
  Shield,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar, LoadingScreen, ResponsiveSidebar, SidebarBrand } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";

type SettingRow = {
  key: string;
  label: string;
  description: string;
  category: string;
  isSecret: boolean;
  options?: string[];
  value: string;
  isSet: boolean;
  storedInDb: boolean;
  updatedAt: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  groq: "Groq / AI",
  whatsapp: "WhatsApp Cloud API",
  chatbot: "Chatbot",
  integrations: "Integrations",
  general: "General",
};

export default function SuperAdminPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user, isLoading, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [clearSecrets, setClearSecrets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Same auth pattern as Admin / other dashboards — shared /login screen
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
    if (!isLoading && user && user.role !== "super_admin") router.replace("/login");
  }, [user, isLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/super-admin/settings", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load settings");
        return;
      }
      const rows = (json.settings ?? []) as SettingRow[];
      setSettings(rows);
      setNote(json.note ?? "");
      const next: Record<string, string> = {};
      for (const r of rows) next[r.key] = r.isSecret ? "" : r.value;
      setDrafts(next);
      setClearSecrets(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "super_admin") load();
  }, [user, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const s of settings) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return Array.from(map.entries());
  }, [settings]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const s of settings) {
      if (clearSecrets.has(s.key)) {
        n += 1;
        continue;
      }
      const draft = drafts[s.key] ?? "";
      if (s.isSecret) {
        if (draft && !draft.includes("••••")) n += 1;
      } else if (draft !== s.value) {
        n += 1;
      }
    }
    return n;
  }, [settings, drafts, clearSecrets]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleImportEnv = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/super-admin/settings/import-env", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed");
        return;
      }
      const rows = (json.settings ?? []) as SettingRow[];
      setSettings(rows);
      const next: Record<string, string> = {};
      for (const r of rows) next[r.key] = r.isSecret ? "" : r.value;
      setDrafts(next);
      setClearSecrets(new Set());
      setSuccess(`Imported ${json.imported ?? 0} key(s) from server environment.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = settings.map((s) => ({
        key: s.key,
        value: drafts[s.key] ?? "",
      }));
      const res = await fetch("/api/super-admin/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: payload,
          clearSecrets: Array.from(clearSecrets),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        return;
      }
      const rows = (json.settings ?? []) as SettingRow[];
      setSettings(rows);
      const next: Record<string, string> = {};
      for (const r of rows) next[r.key] = r.isSecret ? "" : r.value;
      setDrafts(next);
      setClearSecrets(new Set());
      setSuccess("Settings saved. Runtime config reloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return <LoadingScreen message="Loading Super Admin..." />;
  }

  if (user.role !== "super_admin") {
    return <LoadingScreen message="Redirecting..." />;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-100">
      <ResponsiveSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={260} miniWidth={68}>
        <div className="flex flex-col h-full bg-primary-900 text-white">
          <SidebarBrand title="Super Admin" compact className="border-white/10" showText={sidebarOpen} />

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            <div className="pt-1 pb-1 px-1">
              {sidebarOpen && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-2">
                  System
                </p>
              )}
              <button
                type="button"
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                  "bg-white/20 text-white font-semibold",
                  !sidebarOpen && "justify-center",
                )}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                {sidebarOpen && <span>API Keys</span>}
              </button>
            </div>
          </nav>

          <div className="shrink-0 border-t border-white/10 px-3 py-3 space-y-2">
            <div className={cn("flex items-center gap-2 rounded-xl", sidebarOpen ? "px-2 py-2" : "justify-center py-1")}>
              <Avatar name={`${user.firstName} ${user.lastName ?? ""}`} size="sm" status="online" />
              {sidebarOpen && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {user.firstName} {user.lastName ?? ""}
                  </p>
                  <p className="text-[10px] text-white/50 truncate">{user.email}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors",
                !sidebarOpen && "justify-center",
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>Sign out</span>}
            </button>
          </div>
        </div>
      </ResponsiveSidebar>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-100">
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="shrink-0 bg-gradient-to-r from-primary-900 via-primary-800 to-primary-900 px-4 sm:px-6 pt-3 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                </button>
                <div>
                  <h1 className="text-base font-bold text-white leading-tight">Super Admin</h1>
                  <p className="text-xs text-white/50">
                    {user.firstName} {user.lastName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => load()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title="Reload"
                >
                  <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                  <span className="hidden sm:inline">Reload</span>
                </button>
                <button
                  type="button"
                  onClick={handleImportEnv}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title="Copy all current .env keys into the dashboard"
                >
                  <KeyRound className="w-4 h-4" />
                  <span className="hidden sm:inline">Import from env</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner">
                <div className="flex items-start justify-between">
                  <p className="text-3xl font-black text-white">{settings.length}</p>
                  <Shield className="w-5 h-5 text-primary-200 opacity-70 mt-1" />
                </div>
                <p className="text-[11px] text-primary-200 font-semibold mt-1 uppercase tracking-wide">
                  Config keys
                </p>
              </div>
              <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner">
                <div className="flex items-start justify-between">
                  <p className="text-3xl font-black text-white">
                    {settings.filter((s) => s.isSet).length}
                  </p>
                  <KeyRound className="w-5 h-5 text-primary-200 opacity-70 mt-1" />
                </div>
                <p className="text-[11px] text-primary-200 font-semibold mt-1 uppercase tracking-wide">
                  Keys set
                </p>
              </div>
              <div className="bg-white/15 rounded-2xl px-4 py-3.5 border border-white/25 shadow-inner col-span-2 sm:col-span-1">
                <div className="flex items-start justify-between">
                  <p className="text-3xl font-black text-white">
                    {settings.filter((s) => s.storedInDb).length}
                  </p>
                  <Save className="w-5 h-5 text-primary-200 opacity-70 mt-1" />
                </div>
                <p className="text-[11px] text-primary-200 font-semibold mt-1 uppercase tracking-wide">
                  Stored in DB
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-50">
              <div className="flex items-start gap-2">
                <KeyRound className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
                <div className="text-sm text-slate-800">
                  <p className="font-medium">Configure API keys here instead of editing server `.env`.</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {note || "DATABASE_URL and JWT_SECRET stay in environment variables for boot safety."}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Sign in with the shared login screen using{" "}
                    <span className="font-mono">superadmin@poornasree.com</span>.
                  </p>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4 pb-20">
                {grouped.map(([category, rows]) => (
                  <section
                    key={category}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <h2 className="text-sm font-semibold text-slate-800">
                        {CATEGORY_LABELS[category] ?? category}
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <div key={row.key} className="px-4 py-4 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{row.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-1">
                                {row.key}
                                {row.storedInDb ? " · stored in DB" : " · env fallback"}
                                {row.isSet ? " · set" : " · empty"}
                              </p>
                            </div>
                            {row.isSecret && row.isSet && (
                              <button
                                type="button"
                                className="text-[11px] text-red-600 hover:underline"
                                onClick={() => {
                                  setClearSecrets((prev) => new Set(prev).add(row.key));
                                  setDrafts((d) => ({ ...d, [row.key]: "" }));
                                }}
                              >
                                Clear secret
                              </button>
                            )}
                          </div>

                          {row.options ? (
                            <select
                              value={drafts[row.key] ?? row.value}
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              {row.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="relative">
                              <input
                                type={
                                  row.isSecret && !showSecrets[row.key] ? "password" : "text"
                                }
                                value={
                                  row.isSecret
                                    ? clearSecrets.has(row.key)
                                      ? ""
                                      : drafts[row.key] ?? ""
                                    : drafts[row.key] ?? ""
                                }
                                placeholder={
                                  row.isSecret
                                    ? row.isSet && !clearSecrets.has(row.key)
                                      ? row.value || "••••••••"
                                      : "Paste new secret…"
                                    : ""
                                }
                                onChange={(e) => {
                                  setClearSecrets((prev) => {
                                    const next = new Set(prev);
                                    next.delete(row.key);
                                    return next;
                                  });
                                  setDrafts((d) => ({ ...d, [row.key]: e.target.value }));
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm font-mono"
                                autoComplete="off"
                              />
                              {row.isSecret && (
                                <button
                                  type="button"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"
                                  onClick={() =>
                                    setShowSecrets((s) => ({
                                      ...s,
                                      [row.key]: !s[row.key],
                                    }))
                                  }
                                >
                                  {showSecrets[row.key] ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                          {row.isSecret && (
                            <p className="text-[11px] text-slate-500">
                              Leave blank to keep the existing secret. Paste a new value to replace it.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                <div className="sticky bottom-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || dirtyCount === 0}
                    className={cn(
                      "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg",
                      dirtyCount === 0
                        ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                        : "bg-primary-700 text-white hover:bg-primary-800",
                    )}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save {dirtyCount > 0 ? `(${dirtyCount})` : "changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
