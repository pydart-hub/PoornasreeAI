// ── HR Engineer Service ───────────────────────────────────────────────────
// Syncs technicians from the external HR roster API into Poornasree User rows.
// Endpoint: HR_ENGINEERS_URL (default hr_api_v2/public/engineers)

import axios, { AxiosError } from "axios";
import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { runtime } from "./runtime-config.service";
import { normalizeWhatsappNumber } from "./whatsapp.service";
import { sendEngineerSetupNotification } from "./engineer-onboarding.service";

const CACHE_TTL_MS = 5 * 60 * 1000;
const SALT_ROUNDS = 12;
const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface HrEngineerRow {
  id: number;
  name: string;
  role: string;
  ph_number: string;
  area_pin: string;
}

export interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  warning?: string;
}

let _cache: { data: HrEngineerRow[]; fetchedAt: number } = { data: [], fetchedAt: 0 };
let _lastSyncWarning: string | undefined;
let _resolvedManagerId: string | null = null;

function isCacheFresh(): boolean {
  return _cache.data.length > 0 && Date.now() - _cache.fetchedAt < CACHE_TTL_MS;
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Engineer", lastName: null };
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.length > 0 ? rest.join(" ") : null };
}

function hrEmail(hrId: number): string {
  return `hr-${hrId}@sync.poornasree.local`;
}

function generateSetupToken(): { rawToken: string; tokenHash: string; tokenExpiry: Date } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + SETUP_TOKEN_TTL_MS);
  return { rawToken, tokenHash, tokenExpiry };
}

export function getLastSyncWarning(): string | undefined {
  return _lastSyncWarning;
}

export async function fetchHrEngineers(forceRefresh = false): Promise<HrEngineerRow[]> {
  if (!forceRefresh && isCacheFresh()) {
    return _cache.data;
  }

  const url = runtime.hrEngineersUrl();
  console.log(`[hr-engineer.service] Fetching roster from ${url}`);

  try {
    const response = await axios.get<{
      success: boolean;
      data: HrEngineerRow[];
      count?: number;
      message?: string;
    }>(url, { timeout: 15000 });

    if (response.data.success !== true) {
      throw new Error(response.data.message ?? "HR API returned success=false");
    }

    const raw = response.data.data;
    if (!Array.isArray(raw)) {
      throw new Error("HR API returned unexpected data shape");
    }

    const technicians = raw.filter((r) => r.role === "technician");
    _cache = { data: technicians, fetchedAt: Date.now() };
    _lastSyncWarning = undefined;
    console.log(`[hr-engineer.service] Loaded ${technicians.length} technicians`);
    return technicians;
  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>;
    const msg = axiosErr.response
      ? `HR API HTTP ${axiosErr.response.status}`
      : (err as Error).message;
    console.error(`[hr-engineer.service] fetch failed:`, msg);
    if (isCacheFresh()) {
      _lastSyncWarning = `HR sync skipped: ${msg}`;
      return _cache.data;
    }
    throw new Error(msg);
  }
}

async function resolveManagerId(): Promise<string> {
  if (_resolvedManagerId) return _resolvedManagerId;

  if (runtime.hrSyncManagerId()) {
    const user = await prisma.user.findFirst({
      where: { id: runtime.hrSyncManagerId(), role: "service_manager" },
      select: { id: true },
    });
    if (user) {
      _resolvedManagerId = user.id;
      return user.id;
    }
    console.warn(`[hr-engineer.service] HR_SYNC_MANAGER_ID invalid, falling back to first service_manager`);
  }

  const manager = await prisma.user.findFirst({
    where: { role: "service_manager" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!manager) {
    throw new Error("No service_manager found — cannot sync HR engineers");
  }

  _resolvedManagerId = manager.id;
  return manager.id;
}

async function resolvePincodeId(areaPin: string): Promise<string | null> {
  const code = areaPin.trim();
  if (!code) return null;
  const pincode = await prisma.pincode.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!pincode) {
    console.warn(`[hr-engineer.service] area_pin ${code} not found in Pincode table`);
    return null;
  }
  return pincode.id;
}

export async function syncHrEngineers(): Promise<SyncResult> {
  let created = 0;
  let updated = 0;

  try {
    const technicians = await fetchHrEngineers(!isCacheFresh());
    const managerId = await resolveManagerId();
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { firstName: true, lastName: true },
    });
    const managerName = manager
      ? `${manager.firstName}${manager.lastName ? ` ${manager.lastName}` : ""}`
      : "your manager";
    const now = new Date();

    for (const hr of technicians) {
      const { firstName, lastName } = splitName(hr.name);
      const whatsappNumber = hr.ph_number?.trim()
        ? normalizeWhatsappNumber(hr.ph_number.trim())
        : null;
      const pincodeId = hr.area_pin ? await resolvePincodeId(hr.area_pin) : null;

      const existing = await prisma.user.findUnique({
        where: { hrEngineerId: hr.id },
      });

      if (!existing) {
        const unusablePasswordHash = await bcrypt.hash(
          crypto.randomBytes(32).toString("hex"),
          SALT_ROUNDS,
        );
        const { rawToken, tokenHash, tokenExpiry } = generateSetupToken();

        await prisma.user.create({
          data: {
            email: hrEmail(hr.id),
            passwordHash: unusablePasswordHash,
            firstName,
            lastName,
            role: "service_engineer",
            managerId,
            hrEngineerId: hr.id,
            hrSyncedAt: now,
            whatsappNumber: whatsappNumber ?? undefined,
            setPasswordToken: tokenHash,
            setPasswordTokenExpiry: tokenExpiry,
            ...(pincodeId
              ? { engineerPincodes: { connect: [{ id: pincodeId }] } }
              : {}),
          },
        });
        if (whatsappNumber) {
          const sent = await sendEngineerSetupNotification(
            { firstName, email: hrEmail(hr.id), whatsappNumber, pincodes: hr.area_pin ? [hr.area_pin] : [] },
            rawToken,
            managerName,
          );
          if (!sent) {
            console.warn(`[hr-engineer.service] Setup WhatsApp not sent to ${whatsappNumber} (hr id ${hr.id})`);
          }
        }
        created++;
        continue;
      }

      const updateData: {
        firstName: string;
        lastName: string | null;
        hrSyncedAt: Date;
        whatsappNumber?: string | null;
        engineerPincodes?: { set: { id: string }[] };
      } = {
        firstName,
        lastName,
        hrSyncedAt: now,
      };

      if (whatsappNumber) {
        updateData.whatsappNumber = whatsappNumber;
      }

      if (pincodeId) {
        updateData.engineerPincodes = { set: [{ id: pincodeId }] };
      }

      await prisma.user.update({
        where: { id: existing.id },
        data: updateData,
      });
      updated++;
    }

    return {
      synced: technicians.length,
      created,
      updated,
      warning: _lastSyncWarning,
    };
  } catch (err) {
    _lastSyncWarning = (err as Error).message;
    console.error(`[hr-engineer.service] syncHrEngineers:`, _lastSyncWarning);
    return { synced: 0, created: 0, updated: 0, warning: _lastSyncWarning };
  }
}

/** Engineers owned by service manager OR HR-synced under that manager. */
export function engineerManagerWhere(
  role: string,
  userId: string,
  parentManagerId?: string | null,
): Record<string, unknown> {
  if (role === "service_manager") {
    return {
      role: "service_engineer",
      OR: [
        { managerId: userId },
        { managerId: null },
        { manager: { managerId: userId } }
      ],
    };
  }
  if (role === "assistant_service_manager") {
    return {
      role: "service_engineer",
      managerId: userId,
    };
  }
  return { role: "service_engineer" };
}

export async function canManagerAccessEngineer(
  engineer: { managerId: string | null; hrEngineerId: number | null, manager?: { managerId: string | null } | null },
  callerId: string,
  callerRole: string,
  parentManagerId?: string | null,
): Promise<boolean> {
  if (engineer.managerId === callerId) return true;
  if (engineer.managerId === null && callerRole === "service_manager") return true;
  if (callerRole === "service_manager" && engineer.manager?.managerId === callerId) return true;
  return false;
}

export async function getAssistantParentManagerId(assistantUserId: string): Promise<string | null> {
  const assistant = await prisma.user.findUnique({
    where: { id: assistantUserId },
    select: { managerId: true, role: true },
  });
  if (!assistant || assistant.role !== "assistant_service_manager") return null;
  return assistant.managerId;
}

export function mapEngineerSource(hrEngineerId: number | null): "hr" | "local" {
  return hrEngineerId != null ? "hr" : "local";
}
