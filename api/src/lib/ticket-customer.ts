// Shared ticket customer identity — used by WhatsApp, public API, and notifications.

export function parseTicketDescription(desc: string) {
  const pairs: Record<string, string> = {};
  const segments = desc.split(/\n/).flatMap((line) => line.split(/,(?=\s*[A-Za-z]+\s*:)/));
  for (const seg of segments) {
    const m = seg.match(/^\s*([^:]+?):\s*(.+)$/);
    if (m) pairs[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const isStructured = Object.keys(pairs).length >= 2;
  const endCustomerMatch = desc.match(/End customer:\s*([^,]+)/i);
  const addressMatch = desc.match(/Address:\s*([^,]+)/i);
  const serviceAreaMatch = desc.match(
    /Service area:\s*(.+?)(?=,\s*(?:Pincode|Dealer|Address|End customer):|$)/i,
  );
  return {
    isStructured,
    customerName:
      endCustomerMatch?.[1]?.trim() ||
      pairs["customer"] ||
      pairs["customer name"] ||
      pairs["service contact"] ||
      undefined,
    address: addressMatch?.[1]?.trim() || pairs["address"] || undefined,
    location:
      serviceAreaMatch?.[1]?.trim() ||
      pairs["location"] ||
      pairs["service area"] ||
      [pairs["address1"], pairs["address2"]].filter(Boolean).join(", ") ||
      [pairs["place"], pairs["district"], pairs["state"]].filter(Boolean).join(", ") ||
      undefined,
    phone: pairs["phone"] || undefined,
    pincode: pairs["pincode"] || undefined,
  };
}

export function resolveTicketContactPerson(ticket: {
  issueDescription?: string | null;
  problemDescription?: string | null;
  customer?: { firstName?: string | null; lastName?: string | null; role?: string } | null;
}): string | null {
  const issueMeta = parseTicketDescription(ticket.issueDescription ?? "");
  const descMeta = parseTicketDescription(ticket.problemDescription ?? "");
  if (issueMeta.customerName && issueMeta.customerName.toLowerCase() !== "customer") {
    return issueMeta.customerName;
  }
  if (descMeta.customerName && descMeta.customerName.toLowerCase() !== "customer") {
    return descMeta.customerName;
  }
  if (ticket.customer && ticket.customer.role !== "admin") {
    const first = ticket.customer.firstName?.trim();
    if (first && first.toLowerCase() !== "customer") {
      const last = ticket.customer.lastName?.trim();
      return last ? `${first} ${last}` : first;
    }
  }
  return null;
}

export function resolveTicketOrganization(ticket: {
  machineCustomer?: string | null;
}): string | null {
  const org = ticket.machineCustomer?.trim();
  return org || null;
}

export function resolveTicketCustomerName(ticket: {
  machineCustomer?: string | null;
  issueDescription?: string | null;
  problemDescription?: string | null;
  customer?: { firstName?: string | null; lastName?: string | null; role?: string } | null;
}): string | null {
  const person = resolveTicketContactPerson(ticket);
  const org = resolveTicketOrganization(ticket);
  if (person && org && person.toLowerCase() !== org.toLowerCase()) {
    return `${person} (${org})`;
  }
  if (person) return person;
  if (org) return org;
  const first = ticket.customer?.firstName?.trim();
  if (first && ticket.customer?.role !== "admin") {
    const last = ticket.customer?.lastName?.trim();
    return last ? `${first} ${last}` : first;
  }
  return null;
}

export function resolveTicketCustomerPhone(ticket: {
  phoneNumber?: string | null;
  issueDescription?: string | null;
  problemDescription?: string | null;
}): string | null {
  const stored = ticket.phoneNumber?.trim().replace(/\D/g, "");
  if (stored) return stored;
  const issueMeta = parseTicketDescription(ticket.issueDescription ?? "");
  const descMeta = parseTicketDescription(ticket.problemDescription ?? "");
  const parsed = (issueMeta.phone || descMeta.phone || "").replace(/\D/g, "");
  return parsed || null;
}

/** Display as +91XXXXXXXXXX when Indian 12-digit. */
export function formatCustomerPhoneDisplay(digits: string | null | undefined): string {
  if (!digits) return "—";
  const d = digits.replace(/\D/g, "");
  if (!d) return "—";
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

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
