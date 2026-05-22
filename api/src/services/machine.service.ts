// ── Machine Service ───────────────────────────────────────────────────────
// Fetches machine records from the external Passtest bulk API.
// Base URL: https://passtest.poornasreecloud.com
//
// Strategy: GET /api/machines?all=true returns every machine (dealer-sold
// and direct-company-sold) in a single response. We cache the full list for
// CACHE_TTL_MS (5 minutes) and search in-memory on each serial lookup.
// This covers both customer types without needing a per-serial endpoint.

import axios, { AxiosError } from "axios";

const PASSTEST_BASE = "https://passtest.poornasreecloud.com";
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

// ── PasstestMachine ───────────────────────────────────────────────────────
// Normalised shape exposed to all callers. Field names are kept identical
// to the old /summary response so no caller code needs to change.
export interface PasstestMachine {
  serial_no:       string;
  m_model:         string;
  m_version:       string;
  m_build:         string;
  product_code:    string;
  test_result:     string;
  tested_at:       string;
  inspected_by:    string;
  customer:        string;
  Address1:        string;
  Address2:        string;
  invoice_no:      string;
  invoice_date:    string;
  warranty_months: number;
}

// ── In-memory cache ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cache: { data: any[]; fetchedAt: number } = { data: [], fetchedAt: 0 };

function isCacheFresh(): boolean {
  return _cache.data.length > 0 && (Date.now() - _cache.fetchedAt) < CACHE_TTL_MS;
}

// ── refreshCache ──────────────────────────────────────────────────────────
// Fetches GET /api/machines?all=true and stores the result.
// Throws with { status: 502 | 503 } on failure so callers can handle it.
async function refreshCache(): Promise<void> {
  const url = `${PASSTEST_BASE}/api/machines?all=true`;
  console.log(`[machine.service] Refreshing cache from ${url}`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await axios.get<{ success: boolean; data: any; message?: string }>(url, {
      timeout: 15000,
    });

    if (response.data.success !== true) {
      console.warn(`[machine.service] refreshCache: success !== true:`, response.data.message);
      throw Object.assign(new Error("Passtest API returned success=false"), { status: 502 });
    }

    const raw = response.data.data;
    if (!Array.isArray(raw)) {
      console.warn(`[machine.service] refreshCache: data is not an array`);
      throw Object.assign(new Error("Passtest API returned unexpected data shape"), { status: 502 });
    }

    _cache = { data: raw, fetchedAt: Date.now() };
    console.log(`[machine.service] Cache refreshed — ${raw.length} machines loaded`);
  } catch (err) {
    const axiosErr = err as AxiosError<{ success: boolean; message?: string }>;
    if (axiosErr.response) {
      console.error(`[machine.service] refreshCache HTTP ${axiosErr.response.status}:`, axiosErr.response.data);
      throw Object.assign(
        new Error(axiosErr.response.data?.message ?? "Passtest API error"),
        { status: 502 },
      );
    }
    if ((err as { status?: number }).status) throw err; // re-throw our own typed errors
    console.error(`[machine.service] refreshCache network error:`, (err as Error).message);
    throw Object.assign(
      new Error("Passtest API is unreachable. Check network or try again later."),
      { status: 503 },
    );
  }
}

// ── normalize ─────────────────────────────────────────────────────────────
// Maps raw list-endpoint field names to the PasstestMachine shape.
// The bulk endpoint uses capitalized fields (SerialNo, Customer, InvNo …)
// while the old summary used lowercase. Both are handled via ?? fallbacks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): PasstestMachine {
  return {
    serial_no:       raw.serial_no       ?? raw.SerialNo      ?? "",
    m_model:         raw.m_model         ?? "",
    m_version:       raw.m_version       ?? "",
    m_build:         raw.m_build         ?? "",
    product_code:    raw.product_code    ?? "",
    test_result:     raw.test_result     ?? raw.pass_reject   ?? "",
    tested_at:       raw.tested_at       ?? raw.datetime      ?? "",
    inspected_by:    raw.inspected_by    ?? "",
    customer:        raw.customer        ?? raw.Customer      ?? "",
    Address1:        raw.Address1        ?? "",
    Address2:        raw.Address2        ?? "",
    invoice_no:      raw.invoice_no      ?? raw.InvNo         ?? "",
    invoice_date:    raw.invoice_date    ?? raw.InvDate       ?? "",
    warranty_months: raw.warranty_months ?? raw.WARRANTY      ?? 0,
  };
}

// ── fetchMachineBySerial ──────────────────────────────────────────────────
// Public API — unchanged signature. Looks up a machine by serial number
// from the cached bulk list. Returns null if not found.
//
// Routing guarantee (preserved from old behaviour):
//   machine.customer matches a dealer in DB  → ticket goes to dealer dashboard
//   machine.customer is a direct customer    → ticket goes to service manager
export async function fetchMachineBySerial(serialNo: string): Promise<PasstestMachine | null> {
  const serial = serialNo.trim().toUpperCase();
  console.log(`[fetchMachineBySerial] Looking up serial: ${serial}`);

  if (!isCacheFresh()) {
    await refreshCache();
  }

  const match = _cache.data.find((item) => {
    const itemSerial = (item.SerialNo ?? item.serial_no ?? "").toString().trim().toUpperCase();
    return itemSerial === serial;
  });

  if (!match) {
    console.log(`[fetchMachineBySerial] Serial ${serial} not found in bulk list`);
    return null;
  }

  const normalized = normalize(match);
  console.log(`[fetchMachineBySerial] Found:`, JSON.stringify(normalized));
  return normalized;
}
