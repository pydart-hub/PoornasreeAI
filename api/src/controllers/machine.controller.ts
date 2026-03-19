import { Request, Response } from "express";
import prisma from "../lib/prisma";

// GET /api/admin/machines — list all machines
export async function listMachines(_req: Request, res: Response): Promise<void> {
  const machines = await prisma.machine.findMany({ orderBy: { serialNumber: "asc" } });
  res.json({ machines });
}

// POST /api/admin/machines — create a machine
export async function createMachine(req: Request, res: Response): Promise<void> {
  const { serialNumber, modelName, specs } = req.body;
  if (!serialNumber?.trim() || !modelName?.trim()) {
    res.status(400).json({ error: "serialNumber and modelName are required" });
    return;
  }
  const existing = await prisma.machine.findUnique({ where: { serialNumber: serialNumber.trim() } });
  if (existing) {
    res.status(409).json({ error: "A machine with this serial number already exists" });
    return;
  }
  const machine = await prisma.machine.create({
    data: {
      serialNumber: serialNumber.trim(),
      modelName: modelName.trim(),
      specs: specs?.trim() || null,
    },
  });
  res.status(201).json({ machine });
}

// PATCH /api/admin/machines/:id — update a machine
export async function updateMachine(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { serialNumber, modelName, specs, isActive } = req.body;
  const machine = await prisma.machine.findUnique({ where: { id } });
  if (!machine) { res.status(404).json({ error: "Machine not found" }); return; }
  const updated = await prisma.machine.update({
    where: { id },
    data: {
      ...(serialNumber !== undefined && { serialNumber: serialNumber.trim() }),
      ...(modelName !== undefined && { modelName: modelName.trim() }),
      ...(specs !== undefined && { specs: specs?.trim() || null }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  res.json({ machine: updated });
}

// DELETE /api/admin/machines/:id — delete a machine
export async function deleteMachine(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const machine = await prisma.machine.findUnique({ where: { id } });
  if (!machine) { res.status(404).json({ error: "Machine not found" }); return; }
  await prisma.machine.delete({ where: { id } });
  res.json({ message: "Machine deleted" });
}

// GET /api/admin/machines/search?q=00001 — search by last 5 digits (used by simulate service)
export async function searchMachines(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q || "").trim();
  if (!q) { res.status(400).json({ error: "q parameter required" }); return; }
  const machines = await prisma.machine.findMany({
    where: { serialNumber: { endsWith: q }, isActive: true },
    take: 10,
  });
  res.json({ machines });
}
