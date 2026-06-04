import type { TicketStatus } from "./types";

// ── SLA Constants ───────────────────────────────────────────────────
export const SLA_RESPONSE_HOURS = 4;
export const SLA_RESOLUTION_HOURS = 48;

// ── Status badge config ─────────────────────────────────────────────
export const STATUS_BADGE: Record<TicketStatus, { label: string; variant: "info" | "warning" | "default" | "success" | "error" }> = {
  OPEN:        { label: "Open",        variant: "error" },
  ASSIGNED:    { label: "Assigned",    variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  PENDING_OTP: { label: "Pending OTP", variant: "default" },
  CLOSED:      { label: "Closed",      variant: "success" },
};

// ── Age badge (urgency by hours) ────────────────────────────────────
export function getAgeBadge(ageHours: number) {
  if (ageHours > 24) return { color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400", label: `${ageHours}h`, urgency: "Critical" as const };
  if (ageHours >= 6) return { color: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400", label: `${ageHours}h`, urgency: "Urgent" as const };
  return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", label: `${ageHours}h`, urgency: "" as const };
}

// ── Priority from age ───────────────────────────────────────────────
export function getPriorityFromAge(ageHours?: number) {
  if (!ageHours && ageHours !== 0) return { label: "NORMAL" as const, color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", dotColor: "bg-blue-500" };
  if (ageHours > 24) return { label: "URGENT" as const, color: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400", dotColor: "bg-red-500" };
  if (ageHours >= 6) return { label: "HIGH" as const, color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400", dotColor: "bg-amber-500" };
  return { label: "NORMAL" as const, color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", dotColor: "bg-blue-500" };
}

// ── SLA status check ────────────────────────────────────────────────
export function getSLAStatus(hours: number | null | undefined, threshold: number) {
  if (hours == null) return { breached: false, label: "Pending", color: "text-content-secondary dark:text-content-dark-secondary" };
  if (hours <= threshold) return { breached: false, label: "OK", color: "text-emerald-600 dark:text-emerald-400" };
  return { breached: true, label: `BREACHED (+${Math.round(hours - threshold)}h)`, color: "text-red-600 dark:text-red-400" };
}

// ── Parse structured description from chat-created tickets ──
// issueDescription uses comma-separated "Key: Val, Key: Val" format;
// problemDescription may use newlines. Handle both.
export function parseTicketDescription(desc: string) {
  const pairs: Record<string, string> = {};
  // Split by newlines first, then by commas for each segment
  const segments = desc.split(/\n/).flatMap(line => line.split(/,(?=\s*[A-Za-z]+\s*:)/));
  for (const seg of segments) {
    const m = seg.match(/^\s*([^:]+?):\s*(.+)$/);
    if (m) pairs[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const isStructured = Object.keys(pairs).length >= 2;
  const endCustomerMatch = desc.match(/End customer:\s*([^,]+)/i);
  const addressMatch = desc.match(/Address:\s*([^,]+)/i);
  return {
    isStructured,
    customerName:
      pairs["customer"] ||
      pairs["customer name"] ||
      pairs["end customer"] ||
      pairs["service contact"] ||
      endCustomerMatch?.[1]?.trim() ||
      undefined,
    address: pairs["address"] || addressMatch?.[1]?.trim() || undefined,
    location:
      pairs["location"] ||
      pairs["service area"] ||
      [pairs["address1"], pairs["address2"]].filter(Boolean).join(", ") ||
      [pairs["place"], pairs["district"], pairs["state"]].filter(Boolean).join(", ") ||
      undefined,
    phone: pairs["phone"] || undefined,
    pincode: pairs["pincode"] || undefined,
  };
}

/** Prefer Passtest / parsed chat name; never show admin proxy account as customer. */
export function resolveTicketCustomerName(ticket: {
  machineCustomer?: string | null;
  issueDescription?: string | null;
  problemDescription?: string | null;
  customer?: { firstName?: string | null; lastName?: string | null; role?: string } | null;
}): string | null {
  const issueMeta = parseTicketDescription(ticket.issueDescription ?? "");
  const descMeta = parseTicketDescription(ticket.problemDescription ?? "");
  const name =
    ticket.machineCustomer?.trim() ||
    issueMeta.customerName ||
    descMeta.customerName;
  if (name) return name;
  if (ticket.customer?.role === "admin") return null;
  const first = ticket.customer?.firstName?.trim();
  if (!first) return null;
  const last = ticket.customer?.lastName?.trim();
  return last ? `${first} ${last}` : first;
}

/** Chat tickets store the real complaint in problemDescription; issueDescription is metadata. */
export function getTicketComplaintText(
  problemDescription?: string | null,
  issueDescription?: string | null,
): string | null {
  const prob = problemDescription?.trim();
  const iss = issueDescription?.trim();
  const looksLikeMetadata = (s: string) =>
    /^Customer:/i.test(s) && /Location:/i.test(s);
  if (prob && !looksLikeMetadata(prob)) return prob;
  if (iss && !looksLikeMetadata(iss)) return iss;
  return null;
}
