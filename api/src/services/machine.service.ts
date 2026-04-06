// ── Machine Service ───────────────────────────────────────────────────────
// Fetches machine records from the external Passtest API.
// Base URL: https://passtest.poornasreecloud.com

import axios, { AxiosError } from "axios";

const PASSTEST_BASE = "https://passtest.poornasreecloud.com";

// Shape returned by /api/machines/:serialNo summary data
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

/**
 * Fetches the full machine record for a given serial number from the
 * Passtest external API. Returns the parsed data object on success.
 *
 * Throws a typed error with a `status` property on known failure modes:
 *   - 404  → machine not found for that serial number
 *   - 503  → API unreachable (network / timeout)
 *   - 502  → API returned an unexpected error
 */
export async function fetchMachineBySerial(serialNo: string): Promise<PasstestMachine | null> {
  const url = `${PASSTEST_BASE}/api/machines/${encodeURIComponent(serialNo)}/summary`;
  console.log(`[fetchMachineBySerial] Serial: ${serialNo}`);
  console.log(`[fetchMachineBySerial] URL: ${url}`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await axios.get<{ success: boolean; data: any; message?: string }>(url, {
      timeout: 8000,
    });

    console.log(`[fetchMachineBySerial] Full response.data:`, JSON.stringify(response.data));

    // Explicit envelope checks per API.md
    if (response.data.success !== true) {
      console.warn(`[fetchMachineBySerial] success !== true:`, response.data.message);
      return null;
    }
    if (response.data.data == null) {
      console.warn(`[fetchMachineBySerial] data is null`);
      return null;
    }

    const raw = response.data.data;

    // Normalize: API may return lowercase (summary) or capitalized (detail) field names.
    // Handle both so no valid response is mistakenly dropped.
    const normalized: PasstestMachine = {
      serial_no:       raw.serial_no   ?? raw.SerialNo      ?? "",
      m_model:         raw.m_model     ?? "",
      m_version:       raw.m_version   ?? "",
      m_build:         raw.m_build     ?? "",
      product_code:    raw.product_code ?? "",
      test_result:     raw.test_result  ?? raw.pass_reject   ?? "",
      tested_at:       raw.tested_at    ?? raw.datetime      ?? "",
      inspected_by:    raw.inspected_by ?? "",
      customer:        raw.customer     ?? raw.Customer      ?? "",
      Address1:        raw.Address1     ?? "",
      Address2:        raw.Address2     ?? "",
      invoice_no:      raw.invoice_no   ?? raw.InvNo         ?? "",
      invoice_date:    raw.invoice_date ?? raw.InvDate       ?? "",
      warranty_months: raw.warranty_months ?? raw.WARRANTY    ?? 0,
    };

    console.log(`[fetchMachineBySerial] Normalized:`, JSON.stringify(normalized));
    return normalized;
  } catch (err) {
    const axiosErr = err as AxiosError<{ success: boolean; message?: string }>;

    if (axiosErr.response) {
      console.error(`[fetchMachineBySerial] HTTP ${axiosErr.response.status}:`, axiosErr.response.data);
      // API responded with a non-2xx status
      if (axiosErr.response.status === 404) {
        return null;
      }
      throw Object.assign(
        new Error(axiosErr.response.data?.message ?? "Passtest API error"),
        { status: 502 },
      );
    }

    // Network error, DNS failure, or timeout
    console.error(`[fetchMachineBySerial] Network error:`, (err as Error).message);
    throw Object.assign(
      new Error("Passtest API is unreachable. Check network or try again later."),
      { status: 503 },
    );
  }
}
