import { Request, Response } from "express";
import prisma from "../lib/prisma";

// GET /api/admin/pincodes — list all pincodes with engineers and legacy user counts
export async function listPincodes(_req: Request, res: Response): Promise<void> {
  const pincodes = await prisma.pincode.findMany({
    orderBy: { code: "asc" },
    include: {
      users: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      engineers: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  res.json({ pincodes });
}

// POST /api/admin/pincodes — create a pincode
export async function createPincode(req: Request, res: Response): Promise<void> {
  const { code, place, district, state } = req.body;
  if (!code?.trim()) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const existing = await prisma.pincode.findUnique({ where: { code: code.trim() } });
  if (existing) {
    res.status(409).json({ error: "Pincode already exists" });
    return;
  }
  const pincode = await prisma.pincode.create({
    data: {
      code: code.trim(),
      place: place?.trim() || null,
      district: district?.trim() || null,
      state: state?.trim() || null,
    },
  });
  res.status(201).json({ pincode });
}

// PATCH /api/admin/pincodes/:id — update pincode (set engineers, place, district, state)
export async function updatePincode(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { engineerIds, place, district, state } = req.body;

  const pincode = await prisma.pincode.findUnique({ where: { id } });
  if (!pincode) { res.status(404).json({ error: "Pincode not found" }); return; }

  const data: Record<string, unknown> = {};
  if (place !== undefined) data.place = place?.trim() || null;
  if (district !== undefined) data.district = district?.trim() || null;
  if (state !== undefined) data.state = state?.trim() || null;
  if (engineerIds !== undefined) {
    data.engineers = { set: (engineerIds as string[]).map((eid: string) => ({ id: eid })) };
  }

  const updated = await prisma.pincode.update({
    where: { id },
    data,
    include: {
      engineers: { select: { id: true, firstName: true, lastName: true, email: true } },
      users: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
    },
  });
  res.json({ pincode: updated });
}

// DELETE /api/admin/pincodes/:id — delete a pincode
export async function deletePincode(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const pincode = await prisma.pincode.findUnique({ where: { id } });
  if (!pincode) { res.status(404).json({ error: "Pincode not found" }); return; }

  // Unassign users from this pincode first
  await prisma.user.updateMany({ where: { pincodeId: id }, data: { pincodeId: null } });
  await prisma.pincode.delete({ where: { id } });
  res.json({ message: "Pincode deleted" });
}

// PATCH /api/admin/pincodes/:id/assign — assign a user to this pincode (legacy)
export async function assignUserToPincode(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { userId } = req.body;
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }

  const pincode = await prisma.pincode.findUnique({ where: { id } });
  if (!pincode) { res.status(404).json({ error: "Pincode not found" }); return; }

  await prisma.user.update({ where: { id: String(userId) }, data: { pincodeId: id } });
  res.json({ message: "User assigned to pincode" });
}
