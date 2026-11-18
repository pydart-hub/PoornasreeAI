// Pincode extraction and India Post lookup (api.postalpincode.in)

export type PincodePlace = {
  code: string;
  place?: string;
  district?: string;
  state?: string;
  display: string;
};

const PINCODE_IN_TEXT_RE = /\b[1-9]\d{4,5}\b/;

/** Extract first valid 5 or 6-digit pincode from address lines. */
export function extractPincodeFromAddress(
  ...parts: (string | undefined | null)[]
): string | null {
  const combined = parts.filter(Boolean).join(" ");
  if (!combined.trim()) return null;
  const match = combined.match(PINCODE_IN_TEXT_RE);
  return match ? match[0] : null;
}

/** Resolve place/district/state for a 5 or 6-digit pincode via India Post API (for 6-digit Indian PIN codes). */
export async function fetchPlaceFromPincode(code: string): Promise<PincodePlace | null> {
  const trimmed = code.trim();
  if (!/^\d{5,6}$/.test(trimmed)) return null;

  if (/^\d{6}$/.test(trimmed)) {
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${trimmed}`);
      const data = await response.json();
      if (
        Array.isArray(data) &&
        data[0]?.Status === "Success" &&
        Array.isArray(data[0]?.PostOffice) &&
        data[0].PostOffice.length > 0
      ) {
        const po = data[0].PostOffice[0];
        const place     = po.Name     || undefined;
        const district  = po.District || undefined;
        const stateName = po.State    || undefined;
        const display   = [place, district, stateName].filter(Boolean).join(", ") || trimmed;
        return { code: trimmed, place, district, state: stateName, display };
      }
    } catch {
      // Non-blocking — caller may still use pincode without place metadata
    }
  }

  return { code: trimmed, display: trimmed };
}
