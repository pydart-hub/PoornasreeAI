/** Chat tickets: complaint in problemDescription; issueDescription is customer/location metadata. */
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
