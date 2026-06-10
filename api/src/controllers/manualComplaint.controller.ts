import { Request, Response } from "express";
import prisma from "../lib/prisma";

// GET /api/admin/manual-complaints
export const listManualComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const complaints = await prisma.manualComplaint.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ complaints });
  } catch (error) {
    console.error("[listManualComplaints] error:", error);
    res.status(500).json({ error: "Failed to list manual complaints" });
  }
};

// PATCH /api/admin/manual-complaints/:id/review
export const reviewManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
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

// DELETE /api/admin/manual-complaints/:id
export const deleteManualComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.manualComplaint.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("[deleteManualComplaint] error:", error);
    res.status(500).json({ error: "Failed to delete manual complaint" });
  }
};
