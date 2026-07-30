// ── Super Admin — system settings API ────────────────────────────────────

import { Request, Response } from "express";
import {
  listSettingsForAdmin,
  updateSettings,
  loadRuntimeConfig,
  syncEnvOverSystemSettings,
} from "../services/runtime-config.service";

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
