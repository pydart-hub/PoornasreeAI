// ── Passtest Product Warranty Calculation Utility ───────────────────────────

export interface WarrantyStatusResult {
  hasWarranty: boolean;
  active: boolean;
  totalMonths: number | null;
  monthsLeft: number | null;
  daysLeft: number | null;
  expiryDateStr: string | null;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  badgeClass: string;
}

/**
 * Calculates remaining warranty months, days, and status from Passtest data.
 * @param warrantyMonths Total warranty period in months (e.g. 12, 24)
 * @param invoiceDateStr Invoice or dispatch date from Passtest (e.g. "2024-06-15", "15-06-2024")
 */
export function calculateWarrantyStatus(
  warrantyMonths?: number | null,
  invoiceDateStr?: string | null,
): WarrantyStatusResult {
  const months = warrantyMonths ? Number(warrantyMonths) : 0;
  if (!months || months <= 0) {
    const badgeBg = "bg-gray-100 dark:bg-gray-800";
    const badgeText = "text-gray-600 dark:text-gray-300";
    const badgeBorder = "border-gray-200 dark:border-gray-700";
    return {
      hasWarranty: false,
      active: false,
      totalMonths: null,
      monthsLeft: null,
      daysLeft: null,
      expiryDateStr: null,
      label: "No Warranty Info",
      badgeBg,
      badgeText,
      badgeBorder,
      badgeClass: `${badgeBg} ${badgeText} ${badgeBorder}`,
    };
  }

  // Parse invoice date
  let parsedDate: Date | null = null;
  if (invoiceDateStr && invoiceDateStr.trim() && invoiceDateStr !== "0000-00-00") {
    const raw = invoiceDateStr.trim().split(" ")[0].replace(/T.*/, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      parsedDate = new Date(raw);
    } else if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(raw)) {
      const parts = raw.split(/[-/]/);
      parsedDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    } else {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) parsedDate = d;
    }
  }

  if (!parsedDate || isNaN(parsedDate.getTime())) {
    const badgeBg = "bg-blue-50 dark:bg-blue-500/15";
    const badgeText = "text-blue-700 dark:text-blue-300";
    const badgeBorder = "border-blue-200 dark:border-blue-500/30";
    return {
      hasWarranty: true,
      active: true,
      totalMonths: months,
      monthsLeft: null,
      daysLeft: null,
      expiryDateStr: null,
      label: `${months} Months Total`,
      badgeBg,
      badgeText,
      badgeBorder,
      badgeClass: `${badgeBg} ${badgeText} ${badgeBorder}`,
    };
  }

  const expiry = new Date(parsedDate);
  expiry.setMonth(expiry.getMonth() + months);
  const now = new Date();

  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.ceil(diffDays / 30.4375);

  const expiryFormatted = expiry.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (diffDays > 0) {
    const label =
      diffMonths <= 1
        ? `Active (${diffDays}d left)`
        : `Active (${diffMonths} mo left)`;
    const badgeBg = "bg-emerald-50 dark:bg-emerald-500/15";
    const badgeText = "text-emerald-700 dark:text-emerald-300";
    const badgeBorder = "border-emerald-200 dark:border-emerald-500/30";

    return {
      hasWarranty: true,
      active: true,
      totalMonths: months,
      monthsLeft: Math.max(diffMonths, 0),
      daysLeft: Math.max(diffDays, 0),
      expiryDateStr: expiryFormatted,
      label,
      badgeBg,
      badgeText,
      badgeBorder,
      badgeClass: `${badgeBg} ${badgeText} ${badgeBorder}`,
    };
  }

  const badgeBg = "bg-rose-50 dark:bg-rose-500/15";
  const badgeText = "text-rose-700 dark:text-rose-300";
  const badgeBorder = "border-rose-200 dark:border-rose-500/30";

  return {
    hasWarranty: true,
    active: false,
    totalMonths: months,
    monthsLeft: 0,
    daysLeft: 0,
    expiryDateStr: expiryFormatted,
    label: "Warranty Expired",
    badgeBg,
    badgeText,
    badgeBorder,
    badgeClass: `${badgeBg} ${badgeText} ${badgeBorder}`,
  };
}
