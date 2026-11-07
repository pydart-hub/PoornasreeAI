// ── Super Admin — system settings API ────────────────────────────────────

import { Request, Response } from "express";
import {
  listSettingsForAdmin,
  updateSettings,
  loadRuntimeConfig,
  syncEnvOverSystemSettings,
} from "../services/runtime-config.service";
import { runtime } from "../services/runtime-config.service";
import { PROMOTION_TEMPLATES } from "../services/promotion.service";

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "super_admin") {
    res.status(403).json({ error: "Super admins only" });
    return false;
  }
  return true;
}

/** GET /api/super-admin/settings */
export async function getSystemSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const settings = await listSettingsForAdmin();
    res.json({
      settings,
      note: "DATABASE_URL and JWT_SECRET remain in server environment variables only.",
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[super-admin] getSystemSettings:", e.message ?? err);
    res.status(500).json({ error: e.message ?? "Failed to load settings" });
  }
}

/** PATCH /api/super-admin/settings */
export async function patchSystemSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const updates = Array.isArray(req.body?.settings) ? req.body.settings : null;
    if (!updates) {
      res.status(400).json({ error: "Body must include settings: [{ key, value }]" });
      return;
    }

    const clearSecrets: string[] = Array.isArray(req.body?.clearSecrets)
      ? req.body.clearSecrets.map(String)
      : [];

    const settings = await updateSettings(
      updates.map((u: { key?: string; value?: string }) => ({
        key: String(u.key ?? ""),
        value: String(u.value ?? ""),
      })),
      req.user!.userId,
      { clearSecrets },
    );

    res.json({ ok: true, settings });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error("[super-admin] patchSystemSettings:", e.message ?? err);
    res.status(e.status ?? 500).json({ error: e.message ?? "Failed to save settings" });
  }
}

/** POST /api/super-admin/settings/reload — force reload cache from DB */
export async function reloadSystemSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    await loadRuntimeConfig();
    const settings = await listSettingsForAdmin();
    res.json({ ok: true, settings });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? "Reload failed" });
  }
}

/** POST /api/super-admin/settings/import-env — copy all current env keys into DB (overwrite) */
export async function importEnvSystemSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const count = await syncEnvOverSystemSettings(req.user!.userId);
    await loadRuntimeConfig();
    const settings = await listSettingsForAdmin();
    res.json({ ok: true, imported: count, settings });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? "Import failed" });
  }
}

/** GET /api/super-admin/health — live health checks for external services */
export async function getSystemHealth(req: Request, res: Response): Promise<void> {
  if (!requireSuperAdmin(req, res)) return;

  const API_VERSION = "v21.0";

  // ── 1. WhatsApp / Meta token health ─────────────────────────────────────
  const waToken = runtime.waAccessToken();
  const waPhoneId = runtime.waPhoneNumberId();
  const wabaId = runtime.waBusinessAccountId();
  const waConfigured = !!(waToken && waPhoneId);

  let tokenValid: boolean | null = null;
  let tokenError: string | null = null;
  let metaUserId: string | null = null;

  if (waConfigured) {
    try {
      const r = await fetch(`https://graph.facebook.com/${API_VERSION}/me?fields=id,name`, {
        headers: { Authorization: `Bearer ${waToken}` },
        signal: AbortSignal.timeout(8000),
      });
      const body = (await r.json()) as { id?: string; name?: string; error?: { message?: string; code?: number } };
      if (r.ok && body.id) {
        tokenValid = true;
        metaUserId = body.id;
      } else {
        tokenValid = false;
        tokenError = body.error?.message || `HTTP ${r.status}`;
      }
    } catch (err: any) {
      tokenValid = false;
      tokenError = err?.message || "Network error";
    }
  }

  const waHealth = {
    configured: waConfigured,
    tokenValid,
    tokenError,
    metaUserId,
    phoneNumberId: waPhoneId ? `${waPhoneId.slice(0, 4)}...${waPhoneId.slice(-4)}` : null,
    wabaId: wabaId ? `${wabaId.slice(0, 4)}...${wabaId.slice(-4)}` : null,
    testedAt: new Date().toISOString(),
  };

  // ── 2. WhatsApp Template health ──────────────────────────────────────────
  type TemplateStatus = "APPROVED" | "PAUSED" | "REJECTED" | "PENDING" | "NOT_SUBMITTED" | string;

  const catalogNames = new Set(PROMOTION_TEMPLATES.map((t) => t.name));
  const templateMap: Record<string, { name: string; status: TemplateStatus; id?: string; language?: string }> = {};
  let templateFetchError: string | null = null;

  if (waToken && wabaId) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates?limit=100&fields=name,status,id,language`,
        { headers: { Authorization: `Bearer ${waToken}` }, signal: AbortSignal.timeout(8000) }
      );
      const body = (await r.json()) as { data?: Array<{ name: string; status: string; id: string; language: string }>; error?: { message?: string } };
      if (r.ok && Array.isArray(body.data)) {
        for (const t of body.data) {
          templateMap[t.name] = { name: t.name, status: t.status, id: t.id, language: t.language };
        }
      } else {
        templateFetchError = body.error?.message || `HTTP ${r.status}`;
      }
    } catch (err: any) {
      templateFetchError = err?.message || "Network error";
    }
  }

  const templateList = PROMOTION_TEMPLATES.map((t) => {
    const live = templateMap[t.name];
    return {
      name: t.name,
      title: t.title,
      status: live?.status ?? "NOT_SUBMITTED",
      language: live?.language ?? null,
      inCatalog: true,
    };
  });

  // also include any Meta templates not in our catalog
  for (const [name, meta] of Object.entries(templateMap)) {
    if (!catalogNames.has(name)) {
      templateList.push({ name, title: name, status: meta.status, language: meta.language ?? null, inCatalog: false });
    }
  }

  const approved = templateList.filter((t) => t.status === "APPROVED").length;
  const paused = templateList.filter((t) => t.status === "PAUSED").length;
  const rejected = templateList.filter((t) => t.status === "REJECTED").length;
  const notSubmitted = templateList.filter((t) => t.status === "NOT_SUBMITTED").length;

  const templateHealth = {
    fetchError: templateFetchError,
    fetchedAt: new Date().toISOString(),
    total: templateList.length,
    approved,
    paused,
    rejected,
    notSubmitted,
    list: templateList,
  };

  // ── 3. Groq / AI health ──────────────────────────────────────────────────
  const groqKey = runtime.groqApiKey();
  const fastModel = runtime.groqModelFast();
  const agentModel = runtime.groqModelAgent();
  const groqConfigured = !!groqKey;

  let fastModelOk: boolean | null = null;
  let fastModelError: string | null = null;
  let agentModelOk: boolean | null = null;
  let agentModelError: string | null = null;

  async function pingGroqModel(model: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await r.json()) as { choices?: unknown[]; error?: { message?: string; code?: string } };
      if (r.ok && Array.isArray(body.choices)) return { ok: true, error: null };
      return { ok: false, error: body.error?.message || `HTTP ${r.status}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Network error" };
    }
  }

  if (groqConfigured) {
    const [fastResult, agentResult] = await Promise.all([
      pingGroqModel(fastModel),
      pingGroqModel(agentModel),
    ]);
    fastModelOk = fastResult.ok;
    fastModelError = fastResult.error;
    agentModelOk = agentResult.ok;
    agentModelError = agentResult.error;
  }

  const groqHealth = {
    configured: groqConfigured,
    fastModel,
    agentModel,
    fastModelOk,
    fastModelError,
    agentModelOk,
    agentModelError,
    testedAt: new Date().toISOString(),
  };

  // ── Overall status ───────────────────────────────────────────────────────
  const systemsOk = [
    waConfigured && tokenValid === true,
    !templateFetchError && approved > 0,
    groqConfigured && fastModelOk === true && agentModelOk === true,
  ].filter(Boolean).length;

  res.json({
    systemsOk,
    totalSystems: 3,
    whatsapp: waHealth,
    templates: templateHealth,
    groq: groqHealth,
  });
}
