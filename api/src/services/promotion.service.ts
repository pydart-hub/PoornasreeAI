// ── Promotion Service ──────────────────────────────────────────────────────
// Handles customizable Meta WhatsApp marketing templates, audience segmentation,
// live Meta template status synchronization, and broadcast deliveries.

import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { runtime } from "./runtime-config.service";
import * as WhatsAppService from "./whatsapp.service";

export interface TemplateVariableDef {
  index: number;
  label: string;
  placeholder: string;
  defaultValue: string;
  autoFill?: "recipient_name" | "custom";
}

export interface PromotionTemplateCatalogItem {
  id: string;
  name: string;
  title: string;
  category: "MARKETING";
  badge: string;
  description: string;
  headerType: "IMAGE";
  bodyText: string;
  footerText: string;
  variables: TemplateVariableDef[];
  sampleValues: string[];
}

export const PROMOTION_TEMPLATES: PromotionTemplateCatalogItem[] = [
  {
    id: "promo_product_launch_v1",
    name: "promo_product_launch_v1",
    title: "New Product Launch",
    category: "MARKETING",
    badge: "Product Showcase",
    description: "Announce new dairy analyzers, testing equipment, or accessories with an image and key specs.",
    headerType: "IMAGE",
    bodyText: "Hello {{1}},\n\nWe are excited to introduce our latest dairy equipment innovation: *{{2}}*!\n\nKey Highlight: {{3}}\n\nGet exclusive introductory pricing and full specifications today. Contact us for a live demo.",
    footerText: "Poornasree Equipments",
    variables: [
      { index: 1, label: "Customer / Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Customer", autoFill: "recipient_name" },
      { index: 2, label: "Product Name & Model", placeholder: "e.g. LactoGrand Digital", defaultValue: "LactoGrand Digital Analyzer", autoFill: "custom" },
      { index: 3, label: "Key Highlights / Specs", placeholder: "e.g. Dual Ultrasonic Sensor with 99.8% accuracy", defaultValue: "Dual Ultrasonic Sensor with 99.8% accuracy & Cloud Data Sync", autoFill: "custom" },
    ],
    sampleValues: ["Ramesh", "LactoGrand Digital", "Dual Ultrasonic Sensor with 99.8% accuracy"],
  },
  {
    id: "promo_special_offer_v1",
    name: "promo_special_offer_v1",
    title: "Special Discount & Offer",
    category: "MARKETING",
    badge: "Discount",
    description: "Send limited-time promotional pricing, package deals, or seasonal discounts to boost sales.",
    headerType: "IMAGE",
    bodyText: "Dear {{1}},\n\nExclusive Offer Alert! 🎉\n\n{{2}}\n\nThis limited-time discount is valid until *{{3}}*. Upgrade your equipment or stock up on spares now!",
    footerText: "Poornasree Equipments",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Partner", autoFill: "recipient_name" },
      { index: 2, label: "Offer Details", placeholder: "e.g. Flat 15% off on analyzer mainboards and accessories", defaultValue: "Get 15% flat discount on analyzer mainboards and cleaning solutions", autoFill: "custom" },
      { index: 3, label: "Expiry Date", placeholder: "e.g. 15th October 2026", defaultValue: "15th October 2026", autoFill: "custom" },
    ],
    sampleValues: ["Suresh", "Get 15% flat discount on analyzer mainboards and accessories", "15th October 2026"],
  },
  {
    id: "promo_annual_service_v1",
    name: "promo_annual_service_v1",
    title: "Annual Maintenance & Service",
    category: "MARKETING",
    badge: "Service",
    description: "Remind societies and centers to book periodic servicing, sensor cleaning, and calibration.",
    headerType: "IMAGE",
    bodyText: "Hello {{1}},\n\nEnsure uninterrupted dairy operations! Your machine *{{2}}* is due for its periodic health checkup and calibration.\n\nBook your service visit today or contact our helpdesk at {{3}} to schedule an engineer.",
    footerText: "Poornasree Service Care",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Customer", autoFill: "recipient_name" },
      { index: 2, label: "Equipment / Machine Name", placeholder: "e.g. Lactosure Eco Analyzer", defaultValue: "Milk Analyzer Unit", autoFill: "custom" },
      { index: 3, label: "Support Phone / Contact", placeholder: "e.g. +91 90487 40132", defaultValue: "+91 90487 40132", autoFill: "custom" },
    ],
    sampleValues: ["Mahesh", "Lactosure Eco Analyzer", "+91 90487 40132"],
  },
  {
    id: "promo_warranty_protection_v1",
    name: "promo_warranty_protection_v1",
    title: "Warranty Protection & AMC",
    category: "MARKETING",
    badge: "Warranty",
    description: "Encourage equipment owners to extend their warranty coverage and sign up for AMC plans.",
    headerType: "IMAGE",
    bodyText: "Dear {{1}},\n\nProtect your investment! Extended warranty and AMC plans are now available for your *{{2}}*.\n\nEnroll before *{{3}}* to avoid unexpected downtime and enjoy priority service support.",
    footerText: "Poornasree Equipments",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Customer", autoFill: "recipient_name" },
      { index: 2, label: "Equipment Model", placeholder: "e.g. DPST Milk Analyzer", defaultValue: "DPST Milk Analyzer", autoFill: "custom" },
      { index: 3, label: "Enrollment Deadline", placeholder: "e.g. 30th November 2026", defaultValue: "30th November 2026", autoFill: "custom" },
    ],
    sampleValues: ["Anand", "DPST Milk Analyzer", "30th November 2026"],
  },
  {
    id: "promo_festive_celebration_v1",
    name: "promo_festive_celebration_v1",
    title: "Festive Season Celebration",
    category: "MARKETING",
    badge: "Festival",
    description: "Celebrate Diwali, Onam, New Year, or local festivals with greetings and bundled gifts.",
    headerType: "IMAGE",
    bodyText: "Festive Greetings {{1}}! ✨\n\nCelebrate this festive season with special discounts from Poornasree Equipments!\n\nSpecial Festive Deal: {{2}}\n\nValid until {{3}}. Wishing you prosperity and success!",
    footerText: "Poornasree Equipments",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Friend", autoFill: "recipient_name" },
      { index: 2, label: "Festive Deal / Gift", placeholder: "e.g. Free calibration kit worth ₹2,500 with every analyzer", defaultValue: "Free calibration kit and cleaning pack with every analyzer", autoFill: "custom" },
      { index: 3, label: "Validity / Period", placeholder: "e.g. Festive Week Special", defaultValue: "Festive Season Special", autoFill: "custom" },
    ],
    sampleValues: ["Praveen", "Get free calibration kit worth ₹2500 with every analyzer", "Diwali Special"],
  },
  {
    id: "promo_software_update_v1",
    name: "promo_software_update_v1",
    title: "Software & Cloud Updates",
    category: "MARKETING",
    badge: "Tech Upgrade",
    description: "Notify clients of firmware updates, automated SMS reports, cloud synchronization, and new features.",
    headerType: "IMAGE",
    bodyText: "Hello {{1}},\n\nA brand new upgrade is here! Feature: *{{2}}* is now available.\n\nDetails: {{3}}\n\nReach out to your assigned service engineer or support to enable this update on your system.",
    footerText: "Poornasree Support",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued User", autoFill: "recipient_name" },
      { index: 2, label: "Feature / Update Name", placeholder: "e.g. Cloud Milk Data Sync v2", defaultValue: "Cloud Milk Data Sync v2", autoFill: "custom" },
      { index: 3, label: "Update Benefits", placeholder: "e.g. Instant farmer SMS and Bluetooth auto-capture", defaultValue: "Instant farmer SMS alerts and high-speed Bluetooth auto-capture", autoFill: "custom" },
    ],
    sampleValues: ["Kiran", "Cloud Milk Data Sync v2", "Instant farmer SMS and Bluetooth auto-capture"],
  },
  {
    id: "promo_customer_feedback_v1",
    name: "promo_customer_feedback_v1",
    title: "Post-Service Feedback Survey",
    category: "MARKETING",
    badge: "Satisfaction",
    description: "Request valuable reviews and ratings from dairy centers after service completion or installation.",
    headerType: "IMAGE",
    bodyText: "Dear {{1}},\n\nThank you for choosing Poornasree Equipments! We value your experience with our products.\n\nTicket/Reference: {{2}}\n\nPlease share your feedback: {{3}}\n\nYour satisfaction helps us serve you better!",
    footerText: "Poornasree Customer Care",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Customer", autoFill: "recipient_name" },
      { index: 2, label: "Reference / Ticket No.", placeholder: "e.g. Recent Service Visit", defaultValue: "Recent Equipment Service", autoFill: "custom" },
      { index: 3, label: "Feedback Link / Prompt", placeholder: "e.g. Reply 1-5 or click link", defaultValue: "Reply to this message with your rating (1 to 5 stars)", autoFill: "custom" },
    ],
    sampleValues: ["Deepak", "TKT-2026-8812", "https://ai.poornasreecloud.com/feedback"],
  },
  {
    id: "promo_dealer_referral_v1",
    name: "promo_dealer_referral_v1",
    title: "Dealer & Society Referral Program",
    category: "MARKETING",
    badge: "Referral",
    description: "Encourage dealers, engineers, and satisfied society secretaries to refer new dairy units.",
    headerType: "IMAGE",
    bodyText: "Hello {{1}},\n\nPartner with us and earn rewards! Refer a dairy society or center for Poornasree equipment.\n\nReward Benefit: {{2}}\n\nContact our sales coordinator at {{3}} to claim your referral partner benefits.",
    footerText: "Poornasree Partner Network",
    variables: [
      { index: 1, label: "Partner Name", placeholder: "Auto-filled per contact", defaultValue: "Partner", autoFill: "recipient_name" },
      { index: 2, label: "Referral Incentive", placeholder: "e.g. Earn up to ₹5,000 credit per analyzer installation", defaultValue: "Earn attractive commission credits on every successful installation", autoFill: "custom" },
      { index: 3, label: "Coordinator Contact", placeholder: "e.g. +91 90487 40132", defaultValue: "+91 90487 40132", autoFill: "custom" },
    ],
    sampleValues: ["Abdul", "Earn up to ₹5,000 credit per analyzer installation", "+91 94460 00000"],
  },
  {
    id: "promo_consumables_reorder_v1",
    name: "promo_consumables_reorder_v1",
    title: "Spares & Consumables Reorder",
    category: "MARKETING",
    badge: "Spares Refill",
    description: "Notify clients to restock cleaning solutions, stirrers, printer rolls, and replacement sensors.",
    headerType: "IMAGE",
    bodyText: "Dear {{1}},\n\nRunning low on cleaning solutions, sensors, or thermal paper rolls for *{{2}}*?\n\nOrder genuine consumables now: {{3}}\n\nEnsure 100% test accuracy with original Poornasree spares.",
    footerText: "Poornasree Spares & Consumables",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Customer", autoFill: "recipient_name" },
      { index: 2, label: "Equipment / Machine Name", placeholder: "e.g. LactoScan Analyzer", defaultValue: "Milk Analyzer", autoFill: "custom" },
      { index: 3, label: "Order Link / Phone", placeholder: "e.g. Contact spares desk at +91 90487 40132", defaultValue: "Call our spares desk at +91 90487 40132 for same-day dispatch", autoFill: "custom" },
    ],
    sampleValues: ["Manoj", "LactoScan Analyzer", "Express dispatch within 24 hours"],
  },
  {
    id: "promo_equipment_demo_v1",
    name: "promo_equipment_demo_v1",
    title: "Live Product Demonstration Invite",
    category: "MARKETING",
    badge: "Demo & Workshop",
    description: "Invite dairy societies, plant managers, and cooperatives to private equipment demos.",
    headerType: "IMAGE",
    bodyText: "Hello {{1}},\n\nYou are cordially invited to an exclusive live demonstration of *{{2}}*!\n\nSchedule & Details: {{3}}\n\nExperience our next-generation testing speed and cloud reporting firsthand.",
    footerText: "Poornasree Equipments",
    variables: [
      { index: 1, label: "Recipient Name", placeholder: "Auto-filled per contact", defaultValue: "Valued Guest", autoFill: "recipient_name" },
      { index: 2, label: "Equipment to Demo", placeholder: "e.g. LactoGrand Automated Milk Collection Unit", defaultValue: "LactoGrand Automated Milk Collection Unit", autoFill: "custom" },
      { index: 3, label: "Venue & Date / Time", placeholder: "e.g. Friday 3:00 PM at Regional Dairy Center", defaultValue: "Live Demo available on request — contact our technical team", autoFill: "custom" },
    ],
    sampleValues: ["Gopal", "LactoGrand Automated Milk Collection Unit", "Friday 3:00 PM at Regional Dairy Center"],
  },
];

export interface MetaTemplateStatus {
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "NOT_SUBMITTED";
  id?: string;
  category?: string;
  language?: string;
  rejectedReason?: string;
}

/**
 * Fetch live template statuses from Meta Cloud API
 */
export async function getLiveMetaTemplateStatuses(): Promise<Record<string, MetaTemplateStatus>> {
  const token = runtime.waAccessToken();
  const wabaId = runtime.waBusinessAccountId();
  const statusMap: Record<string, MetaTemplateStatus> = {};

  // Initialize all with NOT_SUBMITTED
  for (const t of PROMOTION_TEMPLATES) {
    statusMap[t.name] = { name: t.name, status: "NOT_SUBMITTED" };
  }

  if (!token || !wabaId) {
    return statusMap;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      console.warn(`[promotion] Meta templates fetch failed: ${res.status}`);
      return statusMap;
    }

    const data = (await res.json()) as {
      data?: Array<{
        name: string;
        status: string;
        id: string;
        category: string;
        language: string;
        quality_score?: { score: string };
      }>;
    };

    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        statusMap[item.name] = {
          name: item.name,
          status: (item.status as any) || "UNKNOWN",
          id: item.id,
          category: item.category,
          language: item.language,
        };
      }
    }
  } catch (err) {
    console.error("[promotion] Error fetching Meta templates:", err);
  }

  return statusMap;
}

/**
 * Contact Audience Representation
 */
export interface AudienceContact {
  phone: string;
  name: string;
  category: "engineer" | "customer" | "dealer" | "lead" | "manual";
  email?: string | null;
  location?: string | null;
}

/**
 * Query categorized contacts from the database
 */
export async function getAudienceContacts(category = "all", searchQuery = ""): Promise<{
  contacts: AudienceContact[];
  counts: { all: number; engineers: number; customers: number; dealers: number; leads: number; manual: number };
}> {
  const contactsMap = new Map<string, AudienceContact>();

  // Helper to normalize phone
  const cleanPhone = (p: string | null | undefined): string | null => {
    if (!p) return null;
    const digits = p.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    if (digits.length >= 10 && digits.length <= 15) return digits;
    return null;
  };

  // 1. Fetch Users (engineers, dealers, customers)
  const users = await prisma.user.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      whatsappNumber: true,
      email: true,
      role: true,
    },
  });

  for (const u of users) {
    const phone = cleanPhone(u.whatsappNumber);
    if (!phone) continue;
    const name = `${u.firstName} ${u.lastName || ""}`.trim() || "User";

    let cat: AudienceContact["category"] = "customer";
    if (u.role === "service" || u.role === "service_engineer") cat = "engineer";
    else if (u.role === "dealer") cat = "dealer";
    else if (u.role === "customer") cat = "customer";

    contactsMap.set(phone, {
      phone,
      name,
      category: cat,
      email: u.email,
    });
  }

  // 2. Fetch Customers from Tickets
  const tickets = await prisma.ticket.findMany({
    select: {
      phoneNumber: true,
      machineCustomer: true,
      customer: { select: { firstName: true, lastName: true } },
      place: true,
      district: true,
    },
    take: 1000,
  });

  for (const t of tickets) {
    const phone = cleanPhone(t.phoneNumber);
    if (!phone) continue;
    if (!contactsMap.has(phone)) {
      const custName = t.customer
        ? `${t.customer.firstName} ${t.customer.lastName || ""}`.trim()
        : t.machineCustomer?.trim() || "Customer";
      contactsMap.set(phone, {
        phone,
        name: custName,
        category: "customer",
        location: [t.place, t.district].filter(Boolean).join(", "),
      });
    }
  }

  // 3. Fetch MarketingLeads (including manually added custom numbers)
  const leads = await prisma.marketingLead.findMany({
    select: {
      name: true,
      phone: true,
      tags: true,
      source: true,
    },
    orderBy: { createdAt: "desc" },
  });

  for (const l of leads) {
    const phone = cleanPhone(l.phone);
    if (!phone) continue;
    const isManual = l.source === "manual_promotion" || l.tags?.toLowerCase().includes("manual") || l.tags?.toLowerCase().includes("custom");
    if (!contactsMap.has(phone)) {
      contactsMap.set(phone, {
        phone,
        name: l.name?.trim() || "Lead",
        category: isManual ? "manual" : "lead",
        location: l.tags || undefined,
      });
    }
  }

  const allList = Array.from(contactsMap.values());

  const counts = {
    all: allList.length,
    engineers: allList.filter((c) => c.category === "engineer").length,
    customers: allList.filter((c) => c.category === "customer").length,
    dealers: allList.filter((c) => c.category === "dealer").length,
    leads: allList.filter((c) => c.category === "lead").length,
    manual: allList.filter((c) => c.category === "manual").length,
  };

  // Filter by category
  let filtered = allList;
  if (category && category !== "all") {
    filtered = allList.filter((c) => c.category === category);
  }

  // Filter by search query
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.location && c.location.toLowerCase().includes(q))
    );
  }

  return { contacts: filtered, counts };
}

export interface BroadcastPromotionParams {
  title: string;
  templateName: string;
  templateParams: Record<string, string>; // { "1": "...", "2": "..." }
  imageUrl?: string;
  mediaId?: string;
  targetAudience: string;
  recipientPhones: string[];
  customRecipients?: Array<{ phone: string; name?: string }>;
  createdById?: string;
}

/**
 * Send personalized broadcast campaign
 */
export async function sendPromotionBroadcast(params: BroadcastPromotionParams) {
  const { title, templateName, templateParams, imageUrl, mediaId, targetAudience, recipientPhones, customRecipients, createdById } = params;

  if (!recipientPhones || recipientPhones.length === 0) {
    throw new Error("No recipients selected");
  }

  // Resolve template definition
  const templateDef = PROMOTION_TEMPLATES.find((t) => t.name === templateName);
  if (!templateDef) {
    throw new Error(`Template "${templateName}" not found in catalogue`);
  }

  // Build a lookup map of contacts to resolve recipient names
  const { contacts } = await getAudienceContacts("all");
  const contactMap = new Map<string, AudienceContact>();
  for (const c of contacts) {
    contactMap.set(c.phone, c);
  }

  // Build custom map for manually added numbers with custom names
  const customMap = new Map<string, string>();
  if (Array.isArray(customRecipients)) {
    for (const cr of customRecipients) {
      if (cr.phone) {
        const norm = WhatsAppService.normalizeWhatsappNumber(cr.phone) || cr.phone.replace(/\D/g, "");
        if (cr.name) {
          customMap.set(norm, cr.name);
          customMap.set(cr.phone, cr.name);
        }
      }
    }
  }

  // Create initial campaign record
  const campaign = await prisma.promotionCampaign.create({
    data: {
      title,
      templateName,
      templateParams: templateParams as any,
      imageUrl: imageUrl || null,
      targetAudience,
      recipientCount: recipientPhones.length,
      sentCount: 0,
      failedCount: 0,
      status: "sending",
      createdById: createdById || null,
    },
  });

  const results: Array<{ phone: string; name: string; status: "sent" | "failed"; error?: string }> = [];
  let sentCount = 0;
  let failedCount = 0;

  // Resolve media ID directly with Meta if possible (bypasses any localhost / NAT URL issues)
  let resolvedMediaId = mediaId;
  if (!resolvedMediaId && imageUrl) {
    try {
      // If local relative path
      const cleanRel = imageUrl.replace(/^\//, "");
      const possiblePaths = [
        path.resolve(__dirname, "../../", cleanRel),
        path.resolve(process.cwd(), cleanRel),
        path.resolve(process.cwd(), "uploads", path.basename(cleanRel)),
        path.resolve(process.cwd(), "uploads/promotions", path.basename(cleanRel)),
        path.resolve(__dirname, "../../uploads/promotions", path.basename(cleanRel)),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const fileBuf = fs.readFileSync(p);
          const ext = path.extname(p).toLowerCase();
          const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
          resolvedMediaId = await WhatsAppService.uploadMediaToMeta(fileBuf, mime, path.basename(p)) || undefined;
          if (resolvedMediaId) {
            console.log(`[promotion] Resolved local image to Meta media_id: ${resolvedMediaId}`);
            break;
          }
        }
      }
    } catch (e) {
      console.warn("[promotion] Could not resolve image to Meta media ID, falling back to URL:", e);
    }
  }

  // Resolve base public image URL if relative (fallback)
  let finalHeaderImageUrl = imageUrl;
  if (!resolvedMediaId && imageUrl && !imageUrl.startsWith("http")) {
    const base = runtime.frontendUrl().replace(/\/$/, "");
    finalHeaderImageUrl = `${base}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
  }

  // Iterate over recipients
  for (const rawPhone of recipientPhones) {
    const phone = WhatsAppService.normalizeWhatsappNumber(rawPhone) || rawPhone.replace(/\D/g, "");
    if (!phone) continue;

    const contact = contactMap.get(phone) || contactMap.get(rawPhone);
    const recipientName = customMap.get(phone) || customMap.get(rawPhone) || contact?.name || "Customer";

    // Interpolate parameters in order: {{1}}, {{2}}, {{3}}...
    const bodyParameters: string[] = [];
    for (let i = 1; i <= templateDef.variables.length; i++) {
      const varDef = templateDef.variables.find((v) => v.index === i);
      if (varDef?.autoFill === "recipient_name") {
        // Auto-fill recipient name
        bodyParameters.push(recipientName);
      } else {
        const customVal = templateParams[String(i)] || varDef?.defaultValue || "";
        bodyParameters.push(customVal);
      }
    }

    try {
      const isSent = await WhatsAppService.sendTemplate(phone, {
        name: templateName,
        languageCode: "en",
        bodyParameters,
        headerMediaId: resolvedMediaId,
        headerImageUrl: resolvedMediaId ? undefined : finalHeaderImageUrl,
      });

      if (isSent) {
        sentCount++;
        results.push({ phone, name: recipientName, status: "sent" });
      } else {
        failedCount++;
        results.push({ phone, name: recipientName, status: "failed", error: "Delivery rejected by Meta" });
      }
    } catch (err: any) {
      failedCount++;
      results.push({ phone, name: recipientName, status: "failed", error: err?.message || "Unknown error" });
    }

    // Gentle throttle to respect Meta rate limits (100ms between sends)
    await new Promise((r) => setTimeout(r, 100));
  }

  // Update campaign record
  const updatedCampaign = await prisma.promotionCampaign.update({
    where: { id: campaign.id },
    data: {
      sentCount,
      failedCount,
      status: failedCount === 0 ? "completed" : sentCount > 0 ? "partial" : "failed",
      results: results as any,
    },
  });

  return updatedCampaign;
}

/**
 * Save manual / custom numbers as MarketingLeads in the database
 */
export async function saveManualLeads(leads: Array<{ name?: string; phone: string; tags?: string }>) {
  const saved: any[] = [];
  for (const item of leads) {
    if (!item.phone) continue;
    const digits = item.phone.replace(/\D/g, "");
    if (digits.length < 10) continue;
    const normPhone = digits.length === 10 ? `91${digits}` : digits;
    const leadName = (item.name || "").trim() || "Valued Customer";

    const existing = await prisma.marketingLead.findFirst({
      where: {
        OR: [
          { phone: normPhone },
          { phone: digits },
          { phone: digits.slice(-10) },
        ],
      },
    });

    if (existing) {
      const u = await prisma.marketingLead.update({
        where: { id: existing.id },
        data: {
          name: leadName !== "Valued Customer" ? leadName : existing.name,
          source: "manual_promotion",
          tags: item.tags || existing.tags || "Custom Number",
        },
      });
      saved.push(u);
    } else {
      const c = await prisma.marketingLead.create({
        data: {
          name: leadName,
          phone: normPhone,
          source: "manual_promotion",
          tags: item.tags || "Custom Number",
        },
      });
      saved.push(c);
    }
  }
  return saved;
}

/**
 * Delete manual custom lead by phone
 */
export async function deleteManualLead(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const variants = [phone.trim(), digits, `91${last10}`, last10].filter(Boolean);

  return prisma.marketingLead.deleteMany({
    where: {
      phone: { in: variants },
    },
  });
}
