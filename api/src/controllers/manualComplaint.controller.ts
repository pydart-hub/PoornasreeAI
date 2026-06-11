import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { embedText, searchVectors } from "../services/vector.service";

// GET /api/admin/manual-complaints
export const listManualComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const complaints = await prisma.manualComplaint.findMany({
      orderBy: { createdAt: "desc" },
    });

    const engineers = await prisma.user.findMany({
      where: { role: "service_engineer", whatsappNumber: { not: null } },
      select: { whatsappNumber: true },
    });
    const engPhones = new Set(engineers.map((e: any) => e.whatsappNumber));

    const mapped = complaints.map((c: any) => {
      // Check phone with or without 91 prefix
      const stripped = c.phoneNumber.startsWith("91") ? c.phoneNumber.slice(2) : c.phoneNumber;
      const isEngineer = engPhones.has(c.phoneNumber) || engPhones.has(stripped) || engPhones.has(`91${stripped}`);
      return { ...c, isEngineer };
    });

    res.json({ complaints: mapped });
  } catch (error) {
    console.error("[listManualComplaints] error:", error);
    res.status(500).json({ error: "Failed to list manual complaints" });
  }
};

// PATCH /api/admin/manual-complaints/:id/review
export const reviewManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const complaint = await prisma.manualComplaint.update({
      where: { id },
      data: { isReviewed: true },
    });
    res.json({ complaint });
  } catch (error) {
    console.error("[reviewManualComplaint] error:", error);
    res.status(500).json({ error: "Failed to review manual complaint" });
  }
};

// POST /api/admin/manual-complaints
export const createManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, machineName, complaint } = req.body;
    if (!phoneNumber || !complaint) {
      res.status(400).json({ error: "phoneNumber and complaint are required" });
      return;
    }
    const created = await prisma.manualComplaint.create({
      data: {
        phoneNumber: phoneNumber.trim(),
        machineName: machineName?.trim() || null,
        complaint: complaint.trim(),
      },
    });
    res.json({ complaint: created });
  } catch (error) {
    console.error("[createManualComplaint] error:", error);
    res.status(500).json({ error: "Failed to create manual complaint" });
  }
};

// PATCH /api/admin/manual-complaints/:id
export const updateManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { phoneNumber, machineName, complaint } = req.body;
    const data: Record<string, unknown> = {};
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber.trim();
    if (machineName !== undefined) data.machineName = machineName?.trim() || null;
    if (complaint !== undefined) data.complaint = complaint.trim();
    const updated = await prisma.manualComplaint.update({
      where: { id },
      data,
    });
    res.json({ complaint: updated });
  } catch (error) {
    console.error("[updateManualComplaint] error:", error);
    res.status(500).json({ error: "Failed to update manual complaint" });
  }
};

// DELETE /api/admin/manual-complaints/:id
export const deleteManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.manualComplaint.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("[deleteManualComplaint] error:", error);
    res.status(500).json({ error: "Failed to delete manual complaint" });
  }
};

// POST /api/admin/manual-complaints/scan
export const scanManualComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const complaints = await prisma.manualComplaint.findMany({
      where: { hasMatch: false },
    });
    
    let matchCount = 0;
    for (const c of complaints) {
      const embedding = await embedText(c.complaint);
      const hits = await searchVectors(embedding, 1, ["customer"]);
      // If we find a good semantic match in the customer documents, hide it.
      if (hits.length > 0 && hits[0].score >= 0.75) {
        await prisma.manualComplaint.update({
          where: { id: c.id },
          data: { hasMatch: true },
        });
        matchCount++;
      }
    }
    
    res.json({ success: true, matchCount });
  } catch (error) {
    console.error("[scanManualComplaints] error:", error);
    res.status(500).json({ error: "Failed to scan manual complaints" });
  }
};
