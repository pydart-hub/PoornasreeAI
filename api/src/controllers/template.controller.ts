// ── Template Controller ──────────────────────────────────────────────────
// Admin CRUD for TroubleshootingTemplate + TroubleshootingStep.

import { Request, Response } from "express";
import prisma from "../lib/prisma";

// ── GET /api/admin/templates ─────────────────────────────────────────────
export async function listTemplates(req: Request, res: Response): Promise<void> {
  try {
    const templates = await prisma.troubleshootingTemplate.findMany({
      include: { steps: { orderBy: { stepNumber: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ templates });
  } catch (err) {
    console.error("listTemplates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/templates/:id ─────────────────────────────────────────
export async function getTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const template = await prisma.troubleshootingTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.json({ template });
  } catch (err) {
    console.error("getTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/templates ────────────────────────────────────────────
export async function createTemplate(req: Request, res: Response): Promise<void> {
  try {
    const { problemType, title, description, audience, steps } = req.body;
    if (!problemType || !title || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: "problemType, title, and steps[] are required" });
      return;
    }

    const validAudiences = ["customer", "engineer", "both"];
    if (audience !== undefined && !validAudiences.includes(audience)) {
      res.status(400).json({ error: "audience must be 'customer', 'engineer', or 'both'" });
      return;
    }

    const existing = await prisma.troubleshootingTemplate.findUnique({ where: { problemType } });
    if (existing) {
      res.status(409).json({ error: `Template for "${problemType}" already exists` });
      return;
    }

    const template = await prisma.troubleshootingTemplate.create({
      data: {
        problemType,
        title,
        description: description ?? null,
        audience: audience ?? "customer",
        steps: {
          create: (steps as string[]).map((s, i) => ({
            stepNumber: i + 1,
            stepContent: s,
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    res.status(201).json({ template });
  } catch (err) {
    console.error("createTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/admin/templates/:id ───────────────────────────────────────
// Updates title, description, isActive, and replaces ALL steps.
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { title, description, isActive, audience, steps } = req.body;

    const existing = await prisma.troubleshootingTemplate.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = isActive;
    if (audience !== undefined) {
      const validAudiences = ["customer", "engineer", "both"];
      if (!validAudiences.includes(audience)) {
        res.status(400).json({ error: "audience must be 'customer', 'engineer', or 'both'" });
        return;
      }
      data.audience = audience;
    }

    // If steps provided, replace all existing steps
    if (Array.isArray(steps) && steps.length > 0) {
      await prisma.troubleshootingStep.deleteMany({ where: { templateId: id } });
      data.steps = {
        create: (steps as string[]).map((s, i) => ({
          stepNumber: i + 1,
          stepContent: s,
        })),
      };
    }

    const template = await prisma.troubleshootingTemplate.update({
      where: { id },
      data,
      include: { steps: { orderBy: { stepNumber: "asc" } } },
    });

    res.json({ template });
  } catch (err) {
    console.error("updateTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/templates/:id ──────────────────────────────────────
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const existing = await prisma.troubleshootingTemplate.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

    await prisma.troubleshootingTemplate.delete({ where: { id } });
    res.json({ message: "Template deleted" });
  } catch (err) {
    console.error("deleteTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
