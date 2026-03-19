import { Request, Response } from "express";
import prisma from "../lib/prisma";

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
