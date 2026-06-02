// ── Shared dealer Excel import logic ─────────────────────────────────────
// Used by Service Manager and Admin import endpoints.

import ExcelJS from "exceljs";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = process.env.DEALER_DEFAULT_PASSWORD ?? "Dealer@2026";

export interface ParsedDealerRow {
  firstName: string;
  lastName?: string;
  email?: string;
  password?: string;
  warrantyMonths?: string;
  pincode?: string;
  city?: string;
  state?: string;
  phone?: string;
}

export interface DealerImportResult {
  deleted: number;
  created: number;
  skipped: number;
  errors: number;
  skippedEmails: string[];
  errorMessages: string[];
}

function normaliseKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const nk = normaliseKey(key);
    for (const [k, v] of Object.entries(row)) {
      if (normaliseKey(k) === nk && v.trim()) return v.trim();
    }
  }
  return "";
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function normalizePincode(raw: string): string | null {
  const cleaned = raw.replace(/^[,.\s]+/, "").trim();
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 6) return digits;
  if (digits.length > 0 && digits.length < 6) return digits;
  return cleaned;
}

export function slugEmailFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug || "dealer"}@dealer.poornasree.com`;
}

/** Upsert a Pincode record with place/state metadata. */
export async function upsertPincode(
  code: string,
  place?: string | null,
  state?: string | null,
): Promise<string> {
  const trimmedCode = code.trim();
  let pc = await prisma.pincode.findUnique({ where: { code: trimmedCode } });
  if (!pc) {
    pc = await prisma.pincode.create({
      data: { code: trimmedCode, place: place || null, state: state || null },
    });
  } else if ((place && !pc.place) || (state && !pc.state)) {
    pc = await prisma.pincode.update({
      where: { id: pc.id },
      data: {
        place: place || pc.place,
        state: state || pc.state,
      },
    });
  }
  return pc.id;
}

/** Read all cells in a row by fixed column index (handles merged/empty header cells). */
function readRowCells(row: ExcelJS.Row, colCount: number): string[] {
  const cells: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    cells[c - 1] = String(row.getCell(c).value ?? "").trim();
  }
  return cells;
}

function isDealerHeaderRow(cells: string[]): boolean {
  const normalized = cells.map(normaliseKey);
  const hasDealerName = normalized.some((c) => c === "dealername" || c === "dealernam");
  const hasPinOrMobile = normalized.some(
    (c) => c === "pincode" || c === "pin" || c === "mobilenumber" || c === "mobile",
  );
  return hasDealerName && hasPinOrMobile;
}

/** Parse dealer rows from an Excel buffer (handles header on row 5). */
export async function parseDealerExcel(buffer: ArrayBuffer | Buffer): Promise<ParsedDealerRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  let headerRowNum = 0;
  let headers: string[] = [];
  let colCount = 0;

  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const count = Math.max(row.cellCount, ws.columnCount ?? 0, 6);
    const cells = readRowCells(row, count);
    if (isDealerHeaderRow(cells)) {
      headerRowNum = r;
      headers = cells.map((c) => c.toLowerCase());
      colCount = count;
      break;
    }
  }

  if (headerRowNum === 0) {
    const firstRow = ws.getRow(1);
    colCount = Math.max(firstRow.cellCount, 6);
    headers = readRowCells(firstRow, colCount).map((c) => c.toLowerCase());
    headerRowNum = 1;
  }

  const rows: ParsedDealerRow[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const cells = readRowCells(row, colCount);
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (key) obj[key] = cells[i] ?? "";
    }

    if (!Object.values(obj).some((v) => v !== "")) return;

    const firstName =
      getField(obj, "dealer name", "dealername", "first name", "firstname") || "";
    if (!firstName || /^\d+$/.test(firstName)) return;

    const pincodeRaw = getField(obj, "pincode", "pin", "pin code");
    const city = getField(obj, "city", "place", "location");
    const state = getField(obj, "state");
    const phoneRaw = getField(obj, "mobile number", "mobile", "phone", "whatsapp", "whatsappnumber");

    rows.push({
      firstName,
      lastName: getField(obj, "last name", "lastname") || undefined,
      email: getField(obj, "email", "email address") || undefined,
      password: getField(obj, "password", "pass") || undefined,
      warrantyMonths: getField(obj, "warranty months", "warrantymonths", "warranty") || undefined,
      pincode: pincodeRaw ? normalizePincode(pincodeRaw) ?? undefined : undefined,
      city: city || undefined,
      state: state || undefined,
      phone: phoneRaw ? normalizePhone(phoneRaw) ?? undefined : undefined,
    });
  });

  return rows;
}

async function uniqueEmail(baseEmail: string): Promise<string> {
  let email = baseEmail.toLowerCase();
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { email } })) {
    const [local, domain] = baseEmail.split("@");
    email = `${local}.${suffix}@${domain}`;
    suffix++;
  }
  return email;
}

/** Delete all dealer users and unlink related records. */
export async function deleteAllDealers(): Promise<number> {
  const dealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true },
  });
  const ids = dealers.map((d) => d.id);
  if (ids.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { dealerId: { in: ids } }, data: { dealerId: null } });
    await tx.ticket.updateMany({ where: { assignedDealerId: { in: ids } }, data: { assignedDealerId: null } });
    await tx.workReport.deleteMany({ where: { dealerId: { in: ids } } });
    await tx.user.deleteMany({ where: { role: "dealer" } });
  });

  return ids.length;
}

/** Import dealers from parsed rows. */
export async function importDealerRows(
  rows: ParsedDealerRow[],
  replaceAll = false,
): Promise<DealerImportResult> {
  const result: DealerImportResult = {
    deleted: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    skippedEmails: [],
    errorMessages: [],
  };

  if (replaceAll) {
    result.deleted = await deleteAllDealers();
  }

  const passwordHashCache = new Map<string, string>();
  const getPasswordHash = async (password: string): Promise<string> => {
    const cached = passwordHashCache.get(password);
    if (cached) return cached;
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    passwordHashCache.set(password, hash);
    return hash;
  };

  for (const row of rows) {
    try {
      const password = row.password || DEFAULT_PASSWORD;
      if (password.length < 8) {
        result.errors++;
        result.errorMessages.push(`Password too short for ${row.firstName}`);
        continue;
      }

      let email = row.email?.toLowerCase().trim() || slugEmailFromName(row.firstName);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        email = await uniqueEmail(email);
      }

      let pincodeId: string | null = null;
      if (row.pincode) {
        pincodeId = await upsertPincode(row.pincode, row.city, row.state);
      }

      const passwordHash = await getPasswordHash(password);
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: row.firstName.trim(),
          lastName: row.lastName?.trim() || null,
          role: "dealer",
          warrantyMonths: row.warrantyMonths ? Number(row.warrantyMonths) : null,
          whatsappNumber: row.phone || null,
          pincodeId,
        },
      });
      result.created++;
    } catch (err) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errorMessages.push(`${row.firstName}: ${msg}`);
    }
  }

  return result;
}

/** Full import from Excel buffer. */
export async function importDealersFromExcel(
  buffer: ArrayBuffer | Buffer,
  replaceAll = false,
): Promise<DealerImportResult> {
  const rows = await parseDealerExcel(buffer);
  if (rows.length === 0) {
    return {
      deleted: 0,
      created: 0,
      skipped: 0,
      errors: 1,
      skippedEmails: [],
      errorMessages: ["No dealer rows found in spreadsheet"],
    };
  }
  return importDealerRows(rows, replaceAll);
}
