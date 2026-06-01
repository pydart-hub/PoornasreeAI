// ── Ticket export mapper ───────────────────────────────────────────────────
// Normalized DTO for /api/public/tickets/stage/* and integration webhooks.

import { TicketStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type StageSlug =
  | "created"
  | "assigned"
  | "in-progress"
  | "pending-otp"
  | "closed";

export const STAGE_BY_STATUS: Record<TicketStatus, StageSlug> = {
  [TicketStatus.OPEN]: "created",
  [TicketStatus.ASSIGNED]: "assigned",
  [TicketStatus.IN_PROGRESS]: "in-progress",
  [TicketStatus.PENDING_OTP]: "pending-otp",
  [TicketStatus.CLOSED]: "closed",
};

export const STATUS_BY_STAGE: Record<StageSlug, TicketStatus> = {
  created: TicketStatus.OPEN,
  assigned: TicketStatus.ASSIGNED,
  "in-progress": TicketStatus.IN_PROGRESS,
  "pending-otp": TicketStatus.PENDING_OTP,
  closed: TicketStatus.CLOSED,
};

export const PUBLIC_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  status: true,
  customerId: true,
  phoneNumber: true,
  customerAddress: true,
  machineName: true,
  machineSerialNumber: true,
  machineProductCode: true,
  machineCustomer: true,
  machineAddress1: true,
  machineAddress2: true,
  machineInvoiceNo: true,
  machineInvoiceDate: true,
  machineWarranty: true,
  place: true,
  district: true,
  state: true,
  pincodeId: true,
  problemDescription: true,
  issueDescription: true,
  createdAt: true,
  updatedAt: true,
  firstEngineeredAt: true,
  closedAt: true,
  otpExpiresAt: true,
  otpAttempts: true,
  otpVerified: true,
  customer: { select: { id: true, firstName: true, lastName: true, email: true } },
  dealer: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedManager: { select: { id: true, firstName: true, lastName: true } },
  assignedEngineer: { select: { id: true, firstName: true, lastName: true } },
  pincode: { select: { id: true, code: true, place: true, district: true, state: true } },
} as const satisfies Prisma.TicketSelect;

export type PublicTicketRow = Prisma.TicketGetPayload<{
  select: typeof PUBLIC_TICKET_SELECT;
}>;

function parseIssueDescription(desc: string | null | undefined) {
  if (!desc?.trim()) {
    return { customerName: undefined as string | undefined, location: undefined as string | undefined };
  }
  const pairs: Record<string, string> = {};
  const segments = desc.split(/\n/).flatMap((line) => line.split(/,(?=\s*[A-Za-z]+\s*:)/));
  for (const seg of segments) {
    const m = seg.match(/^\s*([^:]+?):\s*(.+)$/);
    if (m) pairs[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return {
    customerName: pairs["customer"] || pairs["customer name"],
    location:
      pairs["location"] ||
      [pairs["address1"], pairs["address2"]].filter(Boolean).join(", ") ||
      [pairs["place"], pairs["district"], pairs["state"]].filter(Boolean).join(", ") ||
      undefined,
  };
}

function userDisplayName(
  u: { firstName: string; lastName?: string | null } | null | undefined,
): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null;
}

function partyDto(
  u: { id: string; firstName: string; lastName?: string | null; email?: string | null } | null | undefined,
) {
  if (!u) return null;
  const name = userDisplayName(u);
  return {
    id: u.id,
    name,
    ...(u.email != null ? { email: u.email } : {}),
  };
}

function resolveCustomerName(t: PublicTicketRow): string | null {
  if (t.machineCustomer?.trim()) return t.machineCustomer.trim();
  const fromUser = userDisplayName(t.customer);
  if (fromUser) return fromUser;
  const parsed = parseIssueDescription(t.issueDescription);
  return parsed.customerName ?? null;
}

function resolveAddress(t: PublicTicketRow): string | null {
  if (t.customerAddress?.trim()) return t.customerAddress.trim();
  const parts = [t.machineAddress1, t.machineAddress2].filter((s) => s?.trim()).map((s) => s!.trim());
  if (parts.length) return parts.join(", ");
  const parsed = parseIssueDescription(t.issueDescription);
  if (parsed.location) return parsed.location;
  const loc = [t.place, t.district, t.state].filter((s) => s?.trim()).map((s) => s!.trim());
  if (loc.length) return loc.join(", ");
  if (t.pincode) {
    const p = [t.pincode.place, t.pincode.district, t.pincode.state].filter(Boolean).join(", ");
    if (p) return p;
  }
  return null;
}

function resolvePincode(t: PublicTicketRow): string | null {
  return t.pincode?.code ?? null;
}

function resolvePlace(t: PublicTicketRow): string | null {
  return t.place?.trim() || t.pincode?.place?.trim() || null;
}

function resolveDistrict(t: PublicTicketRow): string | null {
  return t.district?.trim() || t.pincode?.district?.trim() || null;
}

function resolveState(t: PublicTicketRow): string | null {
  return t.state?.trim() || t.pincode?.state?.trim() || null;
}

const OTP_WINDOW_MS = 30 * 60 * 1000;

function buildTimestamps(t: PublicTicketRow) {
  const otpExpiresAt = t.otpExpiresAt ? t.otpExpiresAt.toISOString() : null;
  const otpRequestedAt =
    t.otpExpiresAt && t.status === TicketStatus.PENDING_OTP
      ? new Date(t.otpExpiresAt.getTime() - OTP_WINDOW_MS).toISOString()
      : null;
  const assignedAt =
    t.status === TicketStatus.ASSIGNED ? t.updatedAt.toISOString() : null;

  return {
    createdAt: t.createdAt.toISOString(),
    assignedAt,
    workStartedAt: t.firstEngineeredAt?.toISOString() ?? null,
    otpExpiresAt,
    otpRequestedAt,
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}

function buildStageMeta(t: PublicTicketRow, stage: StageSlug) {
  const now = Date.now();
  const createdMs = t.createdAt.getTime();

  switch (stage) {
    case "created":
      return {
        ageHours: Math.round(((now - createdMs) / 3600000) * 10) / 10,
      };
    case "assigned":
      return {
        assignedEngineer: partyDto(t.assignedEngineer),
        assignedManager: partyDto(t.assignedManager),
      };
    case "in-progress":
      return {
        responseTimeHours: t.firstEngineeredAt
          ? Math.round(((t.firstEngineeredAt.getTime() - createdMs) / 3600000) * 10) / 10
          : null,
      };
    case "pending-otp":
      return {
        otpExpiresAt: t.otpExpiresAt?.toISOString() ?? null,
        otpRequestedAt: t.otpExpiresAt
          ? new Date(t.otpExpiresAt.getTime() - OTP_WINDOW_MS).toISOString()
          : null,
        otpAttempts: t.otpAttempts,
        otpLocked: t.otpAttempts >= 3,
      };
    case "closed":
      return {
        otpVerified: t.otpVerified,
        durationHours: t.closedAt
          ? Math.round(((t.closedAt.getTime() - createdMs) / 3600000) * 10) / 10
          : null,
      };
    default:
      return {};
  }
}

/** Maps a DB ticket row to the normalized integration/export shape. */
export function toStageExportDto(t: PublicTicketRow, stageOverride?: StageSlug) {
  const stage = stageOverride ?? STAGE_BY_STATUS[t.status];

  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    stage,
    status: t.status,
    customer: {
      name: resolveCustomerName(t),
      phone: t.phoneNumber?.trim() || null,
      address: resolveAddress(t),
      pincode: resolvePincode(t),
      place: resolvePlace(t),
      district: resolveDistrict(t),
      state: resolveState(t),
    },
    machine: {
      name: t.machineName?.trim() || null,
      serialNumber: t.machineSerialNumber?.trim() || null,
      productCode: t.machineProductCode?.trim() || null,
      invoiceNo: t.machineInvoiceNo?.trim() || null,
      invoiceDate: t.machineInvoiceDate?.trim() || null,
      warrantyMonths: t.machineWarranty ?? null,
    },
    complaint: {
      problemDescription: t.problemDescription,
      issueDescription: t.issueDescription?.trim() || null,
    },
    dealer: partyDto(t.dealer),
    engineer: partyDto(t.assignedEngineer),
    timestamps: buildTimestamps(t),
    stageMeta: buildStageMeta(t, stage),
  };
}

export type StageExportDto = ReturnType<typeof toStageExportDto>;
