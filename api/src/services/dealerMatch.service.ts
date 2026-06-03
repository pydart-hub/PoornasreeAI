// ── Dealer match from Passtest customer name ───────────────────────────────
import prisma from "../lib/prisma";
import { fetchMachineBySerial, type PasstestMachine } from "./machine.service";

export type MachineEnrichmentFields = {
  machineName: string | null;
  machineProductCode: string | null;
  machineCustomer: string | null;
  machineAddress1: string | null;
  machineAddress2: string | null;
  machineInvoiceNo: string | null;
  machineInvoiceDate: string | null;
  machineWarranty: number | null;
};

export type SerialEnrichmentResult = {
  machineFields: MachineEnrichmentFields;
  passtestMatched: boolean;
  suggestedDealerId: string | null;
};

function machineToFields(
  machineData: PasstestMachine | null,
  fallbackName: string | null,
): MachineEnrichmentFields {
  if (!machineData) {
    return {
      machineName: fallbackName,
      machineProductCode: null,
      machineCustomer: null,
      machineAddress1: null,
      machineAddress2: null,
      machineInvoiceNo: null,
      machineInvoiceDate: null,
      machineWarranty: null,
    };
  }
  return {
    machineName: machineData.m_model || fallbackName,
    machineProductCode: machineData.product_code || null,
    machineCustomer: machineData.customer || null,
    machineAddress1: machineData.Address1 || null,
    machineAddress2: machineData.Address2 || null,
    machineInvoiceNo: machineData.invoice_no || null,
    machineInvoiceDate: machineData.invoice_date || null,
    machineWarranty:
      machineData.warranty_months != null ? Number(machineData.warranty_months) : null,
  };
}

function normalizeDealerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when Passtest customer string refers to this dealer (exact or extended name). */
export function passtestCustomerMatchesDealer(
  customerName: string,
  dealerFirst: string,
  dealerLast?: string | null,
): boolean {
  const customer = normalizeDealerName(customerName);
  const dealerFull = normalizeDealerName(
    [dealerFirst, dealerLast].filter(Boolean).join(" "),
  );
  if (!customer || !dealerFull) return false;
  if (customer === dealerFull) return true;
  // Passtest often has a longer label, e.g. "AMOL SCIENTIFIC AND DAIRY MATERIAL"
  if (customer.startsWith(`${dealerFull} `)) return true;
  if (dealerFull.length >= 4 && customer.startsWith(dealerFull)) return true;
  const firstOnly = normalizeDealerName(dealerFirst);
  if (firstOnly && customer === firstOnly) return true;
  return false;
}

/** Match Passtest Customer field to a dealer user by name (longest / best match). */
export async function resolveDealerFromPasstestCustomer(
  customerName: string,
): Promise<string | null> {
  const normalized = normalizeDealerName(customerName);
  if (!normalized) return null;

  const dealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true, firstName: true, lastName: true },
  });

  let best: { id: string; score: number } | null = null;
  for (const d of dealers) {
    if (!passtestCustomerMatchesDealer(normalized, d.firstName, d.lastName)) continue;
    const score = normalizeDealerName([d.firstName, d.lastName].filter(Boolean).join(" ")).length;
    if (!best || score > best.score) best = { id: d.id, score };
  }

  return best?.id ?? null;
}

/** Lookup serial in Passtest and resolve suggested dealer from customer name. */
export async function enrichTicketFromSerial(
  serial: string,
  fallbackMachineName?: string | null,
): Promise<SerialEnrichmentResult> {
  const trimmed = serial.trim();
  let machineData: PasstestMachine | null = null;

  try {
    machineData = await fetchMachineBySerial(trimmed);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`[enrichTicketFromSerial] Passtest error for ${trimmed}: ${e.message}`);
  }

  const passtestMatched = !!machineData;
  const machineFields = machineToFields(machineData, fallbackMachineName?.trim() || null);

  let suggestedDealerId: string | null = null;
  if (machineData?.customer?.trim()) {
    suggestedDealerId = await resolveDealerFromPasstestCustomer(machineData.customer);
  }

  return { machineFields, passtestMatched, suggestedDealerId };
}
