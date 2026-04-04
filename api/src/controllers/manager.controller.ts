// ── Manager Controller ────────────────────────────────────────────────────
// Service-manager-scoped engineer management.
// All handlers enforce that the caller is a service_manager.

import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { TicketStatus } from "@prisma/client";
import prisma from "../lib/prisma";

const SALT_ROUNDS = 12;

// ── POST /api/manager/engineers ───────────────────────────────────────────
// Service manager creates a new service_engineer linked to themselves.
// Optional: pincodeIds array (must be from the manager's own pincodes).
export async function createEngineer(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const { email, password, firstName, lastName, pincodeIds } = req.body;

    if (!email || !password || !firstName) {
      res.status(400).json({ error: "email, password and firstName are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // Validate pincodeIds — each must be managed by this manager
    if (pincodeIds && Array.isArray(pincodeIds) && pincodeIds.length > 0) {
      const managedPincodes = await prisma.pincode.findMany({
        where: { managerId, id: { in: pincodeIds as string[] } },
        select: { id: true },
      });
      if (managedPincodes.length !== pincodeIds.length) {
        res.status(403).json({ error: "One or more pincodes are not in your managed zones" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const engineer = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role: "service_engineer",
        managerId,
        ...(pincodeIds && pincodeIds.length > 0
          ? { engineerPincodes: { connect: (pincodeIds as string[]).map((id: string) => ({ id })) } }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        engineerPincodes: { select: { id: true, code: true, regionName: true } },
      },
    });

    res.status(201).json({ engineer });
  } catch (err) {
    console.error("createEngineer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/manager/engineers ────────────────────────────────────────────
// Lists only the engineers this manager created/owns, with workload counts.
export async function listMyEngineers(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;

    const engineers = await prisma.user.findMany({
      where: { role: "service_engineer", managerId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        engineerPincodes: { select: { id: true, code: true, regionName: true } },
        _count: {
          select: {
            engineerTickets: {
              where: {
                status: {
                  in: [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_OTP],
                },
              },
            },
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    const result = engineers.map(e => ({
      ...e,
      activeTickets: e._count.engineerTickets,
    }));

    res.json({ engineers: result });
  } catch (err) {
    console.error("listMyEngineers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/engineers/:id ─────────────────────────────────────
// Update an engineer's basic info (name, password). Manager-owned only.
export async function updateMyEngineer(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const engineerId = String(req.params.id);
    const { firstName, lastName, newPassword } = req.body;

    const engineer = await prisma.user.findUnique({ where: { id: engineerId } });
    if (!engineer || engineer.role !== "service_engineer") {
      res.status(404).json({ error: "Engineer not found" });
      return;
    }
    if (engineer.managerId !== managerId) {
      res.status(403).json({ error: "This engineer is not in your team" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (firstName) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName?.trim() ?? null;
    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }
      data.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: engineerId },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    res.json({ engineer: updated });
  } catch (err) {
    console.error("updateMyEngineer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/engineers/:id/pincodes ─────────────────────────────
// Replace the engineer's pincode assignments.
// Only pincodes managed by THIS manager are permitted.
export async function setEngineerPincodes(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const engineerId = String(req.params.id);
    const { pincodeIds } = req.body;

    if (!Array.isArray(pincodeIds)) {
      res.status(400).json({ error: "pincodeIds must be an array" });
      return;
    }

    const engineer = await prisma.user.findUnique({ where: { id: engineerId } });
    if (!engineer || engineer.role !== "service_engineer") {
      res.status(404).json({ error: "Engineer not found" });
      return;
    }
    if (engineer.managerId !== managerId) {
      res.status(403).json({ error: "This engineer is not in your team" });
      return;
    }

    // Validate all requested pincodes belong to this manager
    if (pincodeIds.length > 0) {
      const managed = await prisma.pincode.findMany({
        where: { managerId, id: { in: pincodeIds as string[] } },
        select: { id: true },
      });
      if (managed.length !== pincodeIds.length) {
        res.status(403).json({ error: "One or more pincodes are not in your managed zones" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: engineerId },
      data: {
        engineerPincodes: {
          set: (pincodeIds as string[]).map((id: string) => ({ id })),
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        engineerPincodes: { select: { id: true, code: true, regionName: true } },
      },
    });

    res.json({ engineer: updated });
  } catch (err) {
    console.error("setEngineerPincodes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/manager/pincodes ─────────────────────────────────────────────
// Returns the manager's own managed pincodes (for the UI to populate dropdowns).
export async function listMyPincodes(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;

    const pincodes = await prisma.pincode.findMany({
      where: { managerId },
      select: {
        id: true,
        code: true,
        regionName: true,
        engineers: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { code: "asc" },
    });

    res.json({ pincodes });
  } catch (err) {
    console.error("listMyPincodes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/manager/pincodes ────────────────────────────────────────────
// Service manager creates a new pincode and automatically owns it.
export async function createMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const { code, regionName, place, district, state } = req.body;

    if (!code?.trim() || !regionName?.trim()) {
      res.status(400).json({ error: "code and regionName are required" });
      return;
    }

    const trimmedCode = code.trim();
    const existing = await prisma.pincode.findUnique({ where: { code: trimmedCode } });
    if (existing) {
      res.status(409).json({ error: "Pincode already exists" });
      return;
    }

    const pincode = await prisma.pincode.create({
      data: {
        code: trimmedCode,
        regionName: regionName.trim(),
        managerId,
      },
      select: { id: true, code: true, regionName: true },
    });

    res.status(201).json({ pincode });
  } catch (err) {
    console.error("createMyPincode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/pincodes/:id ───────────────────────────────────────
// Service manager edits one of their own pincodes.
export async function updateMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const pincodeId = String(req.params.id);
    const { code, regionName } = req.body;

    const pincode = await prisma.pincode.findUnique({ where: { id: pincodeId } });
    if (!pincode || pincode.managerId !== managerId) {
      res.status(404).json({ error: "Pincode not found or not owned by you" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (regionName !== undefined) data.regionName = regionName.trim();
    if (code !== undefined) {
      const trimmedCode = code.trim();
      if (trimmedCode !== pincode.code) {
        const dup = await prisma.pincode.findUnique({ where: { code: trimmedCode } });
        if (dup) { res.status(409).json({ error: "Pincode already exists" }); return; }
        data.code = trimmedCode;
      }
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const updated = await prisma.pincode.update({
      where: { id: pincodeId },
      data,
      select: { id: true, code: true, regionName: true },
    });

    res.json({ pincode: updated });
  } catch (err) {
    console.error("updateMyPincode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/manager/pincodes/:id ──────────────────────────────────────
// Service manager deletes one of their own pincodes.
// Disconnects engineers and unassigns legacy users first.
export async function deleteMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const pincodeId = String(req.params.id);

    const pincode = await prisma.pincode.findUnique({ where: { id: pincodeId } });
    if (!pincode || pincode.managerId !== managerId) {
      res.status(404).json({ error: "Pincode not found or not owned by you" });
      return;
    }

    // Unassign legacy users and disconnect engineers
    await prisma.user.updateMany({ where: { pincodeId }, data: { pincodeId: null } });
    // Disconnect engineers from this pincode (many-to-many)
    await prisma.pincode.update({
      where: { id: pincodeId },
      data: { engineers: { set: [] } },
    });
    await prisma.pincode.delete({ where: { id: pincodeId } });

    res.json({ message: "Pincode deleted" });
  } catch (err) {
    console.error("deleteMyPincode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
