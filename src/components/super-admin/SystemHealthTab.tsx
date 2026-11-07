"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  Bot,
  FileText,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

interface WhatsAppHealth {
  configured: boolean;
  tokenValid: boolean | null;
  tokenError: string | null;
  metaUserId: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  testedAt: string;
}

interface TemplateItem {
  name: string;
  title: string;
  status: string;
  language: string | null;
  inCatalog: boolean;
}

interface TemplateHealth {
  fetchError: string | null;
  fetchedAt: string;
  total: number;
  approved: number;
  paused: number;
  rejected: number;
  notSubmitted: number;
  list: TemplateItem[];
}

interface GroqHealth {
  configured: boolean;
  fastModel: string;
  agentModel: string;
  fastModelOk: boolean | null;
  fastModelError: string | null;
  agentModelOk: boolean | null;
  agentModelError: string | null;
  testedAt: string;
}

interface HealthData {
  systemsOk: number;
  totalSystems: number;
  whatsapp: WhatsAppHealth;
  templates: TemplateHealth;
  groq: GroqHealth;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatRelativeTime(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatusDot({ ok, loading }: { ok: boolean | null; loading?: boolean }) {
  if (loading) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse" />;
  if (ok === null) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" />;
  if (ok) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "APPROVED"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "PAUSED"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : s === "REJECTED"
      ? "bg-red-100 text-red-700 border-red-200"
      : s === "PENDING"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide", cls)}>
      {status}
    </span>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={cn("text-xs text-slate-800 text-right break-all", mono && "font-mono")}>{value ?? "—"}</span>
    </div>
  );
}

function FixHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex gap-2">
      <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-800 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function SystemHealthTab() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateList, setShowTemplateList] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/health", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Health check failed");
      setData(json as HealthData);
    } catch (err: any) {
      setError(err.message || "Failed to run health check");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  // ── Overall summary bar ──────────────────────────────────────────────
  const allOk = data ? data.systemsOk === data.totalSystems : null;

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div
        className={cn(
          "rounded-2xl px-5 py-4 flex items-center justify-between gap-4 border",
          loading
            ? "bg-slate-50 border-slate-200"
            : allOk === true
            ? "bg-emerald-50 border-emerald-200"
            : allOk === false
            ? "bg-red-50 border-red-200"
            : "bg-slate-50 border-slate-200"
        )}
      >
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          ) : allOk === true ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : allOk === false ? (
            <XCircle className="w-5 h-5 text-red-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <p className={cn("text-sm font-semibold", loading ? "text-slate-500" : allOk ? "text-emerald-800" : "text-red-800")}>
              {loading
                ? "Running health checks…"
                : data
                ? `${data.systemsOk} / ${data.totalSystems} systems healthy`
                : "No data yet"}
            </p>
            {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
          </div>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Re-test all
        </button>
      </div>

      {/* ── Card 1: WhatsApp / Meta Token ── */}
      {(() => {
        const wa = data?.whatsapp;
        const cardOk = wa ? wa.configured && wa.tokenValid === true : null;
        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">WhatsApp / Meta API</p>
                  <p className="text-[11px] text-slate-400">Access token & Cloud API connectivity</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusDot ok={cardOk} loading={loading && !data} />
                <span className="text-xs text-slate-500">
                  {loading && !data ? "checking…" : cardOk ? "Healthy" : cardOk === false ? "Issue detected" : "—"}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-0">
              <InfoRow label="Configured" value={wa ? (wa.configured ? "Yes" : "No") : null} />
              <InfoRow label="Token valid" value={wa?.tokenValid === true ? "✓ Valid" : wa?.tokenValid === false ? "✗ Invalid / Expired" : null} />
              {wa?.tokenError && <InfoRow label="Token error" value={wa.tokenError} />}
              <InfoRow label="Meta user ID" value={wa?.metaUserId ?? null} mono />
              <InfoRow label="Phone Number ID" value={wa?.phoneNumberId ?? null} mono />
              <InfoRow label="WABA ID" value={wa?.wabaId ?? null} mono />
              {wa && <InfoRow label="Last checked" value={formatRelativeTime(wa.testedAt)} />}
            </div>

            {wa?.tokenValid === false && (
              <div className="px-5 pb-4">
                <FixHint>
                  <strong>Token expired or invalid.</strong> Go to Meta Business Manager → System Users → Generate Token → select your WhatsApp app with <code>whatsapp_business_messaging</code> permission → set expiry to <strong>Never</strong>. Paste the new token in API Keys tab above.
                </FixHint>
              </div>
            )}
            {wa && !wa.configured && (
              <div className="px-5 pb-4">
                <FixHint>
                  <strong>WhatsApp not configured.</strong> Set WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, and WA_VERIFY_TOKEN in the API Keys tab.
                </FixHint>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Card 2: Templates ── */}
      {(() => {
        const tpl = data?.templates;
        const cardOk = tpl ? !tpl.fetchError && tpl.approved > 0 : null;
        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">WhatsApp Message Templates</p>
                  <p className="text-[11px] text-slate-400">Live Meta approval status for all promotion templates</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusDot ok={cardOk} loading={loading && !data} />
                <span className="text-xs text-slate-500">
                  {loading && !data
                    ? "checking…"
                    : tpl
                    ? `${tpl.approved}/${tpl.total} approved`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-0">
              {tpl?.fetchError && <InfoRow label="Fetch error" value={tpl.fetchError} />}
              <div className="grid grid-cols-4 gap-2 py-2">
                {[
                  { label: "Approved", val: tpl?.approved, color: "text-emerald-600" },
                  { label: "Paused", val: tpl?.paused, color: "text-amber-600" },
                  { label: "Rejected", val: tpl?.rejected, color: "text-red-600" },
                  { label: "Not submitted", val: tpl?.notSubmitted, color: "text-slate-500" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center rounded-xl bg-slate-50 border border-slate-100 py-2 px-1">
                    <p className={cn("text-xl font-black", color)}>{val ?? "—"}</p>
                    <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide mt-0.5 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
              {tpl && <InfoRow label="Last checked" value={formatRelativeTime(tpl.fetchedAt)} />}
            </div>

            {/* Template list toggle */}
            {tpl && tpl.list.length > 0 && (
              <>
                <button
                  onClick={() => setShowTemplateList((v) => !v)}
                  className="w-full px-5 py-3 flex items-center justify-between text-xs font-medium text-slate-600 hover:bg-slate-50 border-t border-slate-100 transition-colors"
                >
                  <span>View all {tpl.list.length} templates</span>
                  {showTemplateList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showTemplateList && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                          <th className="text-left px-5 py-2 font-semibold">Template</th>
                          <th className="text-left px-3 py-2 font-semibold">Name</th>
                          <th className="text-left px-3 py-2 font-semibold">Status</th>
                          <th className="text-left px-3 py-2 font-semibold">Lang</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tpl.list.map((t) => (
                          <tr key={t.name} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-2.5 font-medium text-slate-800">{t.title}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-400 text-[10px]">{t.name}</td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="px-3 py-2.5 text-slate-500">{t.language ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tpl && (tpl.paused > 0 || tpl.rejected > 0) && (
              <div className="px-5 pb-4">
                <FixHint>
                  {tpl.paused > 0 && (
                    <><strong>{tpl.paused} template(s) paused.</strong> This usually means Meta flagged low engagement or quality. Wait 7 days before re-submitting. Avoid sending to users who haven't opted in.<br /></>
                  )}
                  {tpl.rejected > 0 && (
                    <><strong>{tpl.rejected} template(s) rejected.</strong> Edit the template content in Meta Business Manager → Message Templates and re-submit for review.</>
                  )}
                </FixHint>
              </div>
            )}

            {tpl && tpl.notSubmitted > 0 && (
              <div className="px-5 pb-4">
                <FixHint>
                  <strong>{tpl.notSubmitted} template(s) not found on Meta.</strong> These exist in the app catalog but haven't been submitted to Meta Business Manager yet. Submit them at business.facebook.com → WhatsApp Manager → Message Templates.
                </FixHint>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Card 3: Groq AI ── */}
      {(() => {
        const groq = data?.groq;
        const cardOk = groq
          ? groq.configured && groq.fastModelOk === true && groq.agentModelOk === true
          : null;
        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Groq AI / Chatbot</p>
                  <p className="text-[11px] text-slate-400">API key validity and model availability</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusDot ok={cardOk} loading={loading && !data} />
                <span className="text-xs text-slate-500">
                  {loading && !data ? "checking…" : cardOk ? "Healthy" : cardOk === false ? "Issue detected" : "—"}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-0">
              <InfoRow label="API key set" value={groq ? (groq.configured ? "Yes" : "Not configured") : null} />
              <div className="py-2 space-y-2">
                {[
                  { label: "Fast model", model: groq?.fastModel, ok: groq?.fastModelOk, err: groq?.fastModelError },
                  { label: "Agent model", model: groq?.agentModel, ok: groq?.agentModelOk, err: groq?.agentModelError },
                ].map(({ label, model, ok, err }) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 font-medium">{label}</span>
                      <div className="flex items-center gap-1.5">
                        <StatusDot ok={ok ?? null} loading={loading && !data} />
                        <span className={cn("text-[10px] font-semibold", ok === true ? "text-emerald-600" : ok === false ? "text-red-600" : "text-slate-400")}>
                          {ok === true ? "OK" : ok === false ? "FAILED" : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">{model ?? "—"}</p>
                    {err && <p className="text-[10px] text-red-500 mt-1">{err}</p>}
                  </div>
                ))}
              </div>
              {groq && <InfoRow label="Last checked" value={formatRelativeTime(groq.testedAt)} />}
            </div>

            {groq && !groq.configured && (
              <div className="px-5 pb-4">
                <FixHint>
                  <strong>Groq API key not set.</strong> Get a free key at console.groq.com and paste it in the API Keys tab as GROQ_API_KEY.
                </FixHint>
              </div>
            )}
            {groq?.configured && (groq.fastModelOk === false || groq.agentModelOk === false) && (
              <div className="px-5 pb-4">
                <FixHint>
                  <strong>One or more Groq models are unavailable.</strong> Groq periodically deprecates model IDs. Update GROQ_MODEL_FAST and GROQ_MODEL_AGENT in the API Keys tab with current model names from{" "}
                  <strong>console.groq.com/docs/models</strong>. Common working models: <code>llama-3.3-70b-versatile</code>, <code>llama-3.1-8b-instant</code>.
                </FixHint>
              </div>
            )}
          </div>
        );
      })()}

      {/* Footer note */}
      <p className="text-[11px] text-slate-400 text-center pb-2 flex items-center justify-center gap-1">
        <Clock className="w-3 h-3" />
        Health checks call live external APIs. Results are not cached.
      </p>
    </div>
  );
}
