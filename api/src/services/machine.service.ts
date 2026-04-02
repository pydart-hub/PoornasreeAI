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

  try {
    const response = await axios.get<{ success: boolean; data: PasstestMachine }>(url, {
      timeout: 8000,
    });

    return response.data.data;
  } catch (err) {
    const axiosErr = err as AxiosError<{ success: boolean; message?: string }>;

    if (axiosErr.response) {
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
    throw Object.assign(
      new Error("Passtest API is unreachable. Check network or try again later."),
      { status: 503 },
    );
  }
}
