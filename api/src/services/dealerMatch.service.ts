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

/** Match Passtest Customer field to a dealer user by name. */
export async function resolveDealerFromPasstestCustomer(
  customerName: string,
): Promise<string | null> {
  const normalized = customerName.trim().toLowerCase();
  if (!normalized) return null;

  const dealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true, firstName: true, lastName: true },
  });

  const matched = dealers.find((d) => {
    const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ").toLowerCase();
    return fullName === normalized || d.firstName.toLowerCase() === normalized;
  });

  return matched?.id ?? null;
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
