import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { runtime } from "../services/runtime-config.service";
import * as WhatsAppService from "../services/whatsapp.service";
import * as fs from "fs";

// GET /api/branding — public, returns branding settings
export async function getBranding(_req: Request, res: Response): Promise<void> {
  const branding = await prisma.branding.findFirst();
  if (!branding) {
    res.json({
      companyName: "Poornasree",
      logoUrl: null,
      address: null,
      primaryColor: "#2563eb",
      tagline: null,
    });
    return;
  }
  res.json(branding);
}

// PATCH /api/admin/branding — admin update
export async function updateBranding(req: Request, res: Response): Promise<void> {
  const { companyName, address, primaryColor, tagline } = req.body;

  // Get or create singleton
  let branding = await prisma.branding.findFirst();
  if (!branding) {
    branding = await prisma.branding.create({ data: {} });
  }

  const updated = await prisma.branding.update({
    where: { id: branding.id },
    data: {
      ...(companyName !== undefined && { companyName }),
      ...(address !== undefined && { address }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(tagline !== undefined && { tagline }),
    },
  });
  res.json(updated);
}

// POST /api/admin/branding/logo — upload logo image
export async function uploadLogo(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  let branding = await prisma.branding.findFirst();
  if (!branding) {
    branding = await prisma.branding.create({ data: {} });
  }

  const logoUrl = `/uploads/${req.file.filename}`;
  const updated = await prisma.branding.update({
    where: { id: branding.id },
    data: { logoUrl },
  });
  res.json(updated);
}

// ─────────────────────────────────────────────
// Marketing Leads
// ─────────────────────────────────────────────

// GET /api/admin/branding/leads
export async function listLeads(_req: Request, res: Response): Promise<void> {
  const leads = await prisma.marketingLead.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json({ leads });
}

// POST /api/admin/branding/leads — add a single lead
export async function addLead(req: Request, res: Response): Promise<void> {
  const { name, phone, tags } = req.body as { name?: string; phone?: string; tags?: string };
  if (!name || !phone) {
    res.status(400).json({ error: "name and phone are required" });
    return;
  }
  // Normalize phone — strip all non-digits
  const normalizedPhone = String(phone).replace(/\D/g, "");
  if (normalizedPhone.length < 10) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  try {
    const lead = await prisma.marketingLead.upsert({
      where: { phone: normalizedPhone },
      create: { name: String(name).trim(), phone: normalizedPhone, tags, source: "manual" },
      update: { name: String(name).trim(), tags },
    });
    res.status(201).json({ lead });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}

// POST /api/admin/branding/leads/import — bulk import via JSON array or CSV file
export async function importLeads(req: Request, res: Response): Promise<void> {
  let rows: { name: string; phone: string; tags?: string }[] = [];

  if (req.file) {
    // CSV file uploaded via multer diskStorage — read from file path
    const csvText = fs.readFileSync(req.file.path, "utf-8");
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    // First line may be header — skip if it doesn't start with a digit
    const startIdx = /^\D/i.test(lines[0]?.split(",")[1]?.trim() ?? "9") ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const name = parts[0]?.trim().replace(/^"|"$/g, "");
      const phone = parts[1]?.trim().replace(/^"|"$/g, "").replace(/\D/g, "");
      const tags  = parts[2]?.trim().replace(/^"|"$/g, "") || undefined;
      if (name && phone && phone.length >= 10) rows.push({ name, phone, tags });
    }
  } else if (Array.isArray(req.body?.leads)) {
    // JSON array body
    for (const item of req.body.leads) {
      const phone = String(item.phone ?? "").replace(/\D/g, "");
      if (item.name && phone.length >= 10) {
        rows.push({ name: String(item.name).trim(), phone, tags: item.tags });
      }
    }
  } else {
    res.status(400).json({ error: "Provide a CSV file or JSON body { leads: [{name, phone}] }" });
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ error: "No valid leads found in the import" });
    return;
  }

  // Upsert all rows
  let imported = 0;
  for (const row of rows) {
    await prisma.marketingLead.upsert({
      where: { phone: row.phone },
      create: { name: row.name, phone: row.phone, tags: row.tags, source: "csv" },
      update: { name: row.name, tags: row.tags },
    });
    imported++;
  }

  res.json({ imported, total: rows.length });
}

// DELETE /api/admin/branding/leads/:id
export async function deleteLead(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  await prisma.marketingLead.delete({ where: { id } }).catch(() => null);
  res.json({ success: true });
}

// ─────────────────────────────────────────────
// Branding Campaigns (WhatsApp Bulk Marketing)
// ─────────────────────────────────────────────

// GET /api/admin/branding/campaigns
export async function listCampaigns(_req: Request, res: Response): Promise<void> {
  const campaigns = await prisma.brandingCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  res.json({ campaigns });
}

// POST /api/admin/branding/campaigns — create a campaign (image uploaded via multer)
export async function createCampaign(req: Request, res: Response): Promise<void> {
  const { title, caption, leadIds } = req.body as {
    title?: string;
    caption?: string;
    leadIds?: string; // JSON-stringified array
  };

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Campaign image is required" });
    return;
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  let parsedLeadIds: string[] = [];
  try {
    parsedLeadIds = leadIds ? JSON.parse(leadIds) : [];
  } catch { /* ignore */ }

  const campaign = await prisma.brandingCampaign.create({
    data: {
      title: String(title).trim(),
      imageUrl,
      caption: caption ? String(caption).trim() : null,
      leads: parsedLeadIds.length > 0
        ? { create: parsedLeadIds.map((id: string) => ({ lead: { connect: { id } }, status: "pending" })) }
        : undefined,
    },
    include: { _count: { select: { leads: true } } },
  });

  res.status(201).json({ campaign });
}

// DELETE /api/admin/branding/campaigns/:id
export async function deleteCampaign(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  await prisma.brandingCampaign.delete({ where: { id } }).catch(() => null);
  res.json({ success: true });
}

// POST /api/admin/branding/campaigns/:id/leads — add leads to an existing campaign
export async function addLeadsToCampaign(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { leadIds } = req.body as { leadIds?: string[] };
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    res.status(400).json({ error: "leadIds array is required" });
    return;
  }
  // Upsert each lead into campaign
  for (const leadId of leadIds) {
    await prisma.brandingCampaignLead.upsert({
      where: { campaignId_leadId: { campaignId: id, leadId } },
      create: { campaignId: id, leadId, status: "pending" },
      update: {},
    });
  }
  res.json({ success: true });
}

// POST /api/admin/branding/campaigns/:id/send — bulk send via Meta WhatsApp
type CampaignWithLeads = Prisma.BrandingCampaignGetPayload<{
  include: { leads: { include: { lead: true } } };
}>;

export async function sendCampaign(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  const campaign = (await prisma.brandingCampaign.findUnique({
    where: { id },
    include: { leads: { include: { lead: true } } },
  })) as CampaignWithLeads | null;

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (campaign.status === "sending") {
    res.status(409).json({ error: "Campaign is already being sent" });
    return;
  }

  // Mark as sending
  await prisma.brandingCampaign.update({
    where: { id },
    data: { status: "sending" },
  });

  // Build the public image URL from the relative path
  const publicImageUrl = `${runtime.frontendUrl()}${campaign.imageUrl}`;

  // Fire-and-forget the bulk send so HTTP response returns immediately
  res.json({ success: true, message: "Campaign send started", total: campaign.leads.length });

  // Run async bulk send
  let sentCount = 0;
  let failedCount = 0;

  for (const cl of campaign.leads) {
    try {
      await WhatsAppService.sendImage(cl.lead.phone, publicImageUrl, campaign.caption ?? undefined);
      await prisma.brandingCampaignLead.update({
        where: { id: cl.id },
        data: { status: "sent", sentAt: new Date() },
      });
      sentCount++;
    } catch {
      await prisma.brandingCampaignLead.update({
        where: { id: cl.id },
        data: { status: "failed" },
      });
      failedCount++;
    }
    // Throttle: 1 message per 250ms to avoid Meta rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  await prisma.brandingCampaign.update({
    where: { id },
    data: {
      status: "sent",
      sentAt: new Date(),
      sentCount,
      failedCount,
    },
  });

  console.log(`[branding] Campaign ${id} sent: ${sentCount} ok, ${failedCount} failed`);
}
