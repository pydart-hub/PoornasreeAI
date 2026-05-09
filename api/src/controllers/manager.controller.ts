// ── Manager Controller ────────────────────────────────────────────────────
// Service-manager-scoped engineer management.
// All handlers enforce that the caller is a service_manager.

import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { TicketStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import ExcelJS from "exceljs";
import * as WhatsAppService from "../services/whatsapp.service";
import { env } from "../config/env";

const SALT_ROUNDS = 12;

// ── POST /api/manager/engineers ───────────────────────────────────────────
// Service manager creates a new service_engineer linked to themselves.
// Optional: pincodeIds array.
// The engineer sets their own password via a one-time WhatsApp link (no password in request).
export async function createEngineer(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const { email, firstName, lastName, pincodeIds, whatsappNumber } = req.body;

    if (!email || !firstName) {
      res.status(400).json({ error: "email and firstName are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    // Account is locked until engineer sets their own password via the WhatsApp link.
    const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), SALT_ROUNDS);

    // Generate a one-time set-password token (32 random bytes → hex).
    // Store only the SHA-256 hash in the DB for security.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const engineer = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: unusablePasswordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role: "service_engineer",
        managerId,
        setPasswordToken: tokenHash,
        setPasswordTokenExpiry: tokenExpiry,
        ...(whatsappNumber ? { whatsappNumber: whatsappNumber.trim() } : {}),
        ...(pincodeIds && pincodeIds.length > 0
          ? { engineerPincodes: { connect: (pincodeIds as string[]).map((id: string) => ({ id })) } }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        whatsappNumber: true,
        role: true,
        createdAt: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
      },
    });

    // Send WhatsApp greeting with set-password link (fire-and-forget)
    const setPasswordUrl = `${env.FRONTEND_URL}/set-password?token=${rawToken}`;
    if (engineer.whatsappNumber) {
      const manager = engineer.manager;
      const managerName = manager ? `${manager.firstName}${manager.lastName ? " " + manager.lastName : ""}` : "your manager";
      const greeting = [
        `🎉 Welcome to Poornasree Service Team, ${engineer.firstName}!`,
        "",
        `You've been registered as a Service Engineer by ${managerName}.`,
        "",
        "To get started, please set your password by clicking the link below:",
        setPasswordUrl,
        "",
        `Your login email: ${engineer.email}`,
        "",
        "You'll receive ticket assignments and updates here on WhatsApp.",
        "",
        "Thank you! 🙏",
      ].join("\n");
      WhatsAppService.sendMessage(engineer.whatsappNumber, greeting).catch((err) =>
        console.error("[manager] Failed to send engineer greeting:", err),
      );
    } else {
      console.log(`[manager] Engineer ${engineer.email} has no WhatsApp number — set-password URL: ${setPasswordUrl}`);
    }

    res.status(201).json({ engineer, setPasswordUrl });
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
        whatsappNumber: true,
        createdAt: true,
        engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
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
    const { firstName, lastName, newPassword, whatsappNumber } = req.body;

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
    if (whatsappNumber !== undefined) data.whatsappNumber = whatsappNumber?.trim() || null;
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
      select: { id: true, email: true, firstName: true, lastName: true, whatsappNumber: true, role: true },
    });

    res.json({ engineer: updated });
  } catch (err) {
    console.error("updateMyEngineer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/manager/engineers/:id ────────────────────────────────────
// Manager deletes one of their own engineers. Unlinks tickets before deletion.
export async function deleteEngineer(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.user!.userId;
    const engineerId = String(req.params.id);

    const engineer = await prisma.user.findUnique({ where: { id: engineerId } });
    if (!engineer || engineer.role !== "service_engineer" || engineer.managerId !== managerId) {
      res.status(404).json({ error: "Engineer not found" });
      return;
    }

    // Block deletion if any tickets are actively in flight
    const activeTickets = await prisma.ticket.findMany({
      where: {
        assignedEngineerId: engineerId,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
      },
      select: { id: true, ticketNumber: true, status: true },
    });

    if (activeTickets.length > 0) {
      res.status(400).json({
        error: `Cannot delete — ${activeTickets.length} active ticket(s) are still assigned to this engineer. Reassign them to another engineer first.`,
        activeTickets,
      });
      return;
    }

    await prisma.user.delete({ where: { id: engineerId } });

    res.json({ message: "Engineer deleted" });
  } catch (err) {
    console.error("deleteEngineer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/engineers/:id/pincodes ─────────────────────────────
// Replace the engineer's pincode assignments.
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
        engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
      },
    });

    res.json({ engineer: updated });
  } catch (err) {
    console.error("setEngineerPincodes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/manager/pincodes ─────────────────────────────────────────────
// Returns all pincodes in the system.
export async function listMyPincodes(req: Request, res: Response): Promise<void> {
  try {
    const pincodes = await prisma.pincode.findMany({
      select: {
        id: true,
        code: true,
        place: true,
        district: true,
        state: true,
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

// ── POST /api/manager/pincodes/batch ────────────────────────────────────────
// Batch-save multiple pincodes. Skips codes that already exist.
export async function createMyPincodesBatch(req: Request, res: Response): Promise<void> {
  try {
    const { pincodes } = req.body;

    if (!Array.isArray(pincodes) || pincodes.length === 0) {
      res.status(400).json({ error: "pincodes must be a non-empty array of { code, place, district, state }" });
      return;
    }

    for (const entry of pincodes) {
      if (!entry.code?.trim()) {
        res.status(400).json({ error: "Each entry must have a non-empty code" });
        return;
      }
    }

    type PincodeInput = { code: string; place?: string; district?: string; state?: string };
    const codes = (pincodes as PincodeInput[]).map(p => p.code.trim());

    const existing = await prisma.pincode.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map(p => p.code));
    const toCreate = (pincodes as PincodeInput[]).filter(p => !existingCodes.has(p.code.trim()));

    const created = await prisma.$transaction(
      toCreate.map(p =>
        prisma.pincode.create({
          data: {
            code: p.code.trim(),
            place: p.place?.trim() || null,
            district: p.district?.trim() || null,
            state: p.state?.trim() || null,
          },
          select: { id: true, code: true, place: true, district: true, state: true },
        })
      )
    );

    res.status(201).json({
      created,
      skipped: codes.filter(c => existingCodes.has(c)),
    });
  } catch (err) {
    console.error("createMyPincodesBatch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/manager/pincodes ────────────────────────────────────────────
// Creates a single pincode. Returns 409 if already exists.
export async function createMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const { code, place, district, state } = req.body;

    if (!code?.trim()) {
      res.status(400).json({ error: "Pincode code is required" });
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
        place: place?.trim() || null,
        district: district?.trim() || null,
        state: state?.trim() || null,
      },
      select: { id: true, code: true, place: true, district: true, state: true },
    });

    res.status(201).json({ pincode });
  } catch (err) {
    console.error("createMyPincode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/pincodes/:id ───────────────────────────────────────
// Service manager edits a pincode.
export async function updateMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const pincodeId = String(req.params.id);
    const { code, place, district, state } = req.body;

    const pincode = await prisma.pincode.findUnique({ where: { id: pincodeId } });
    if (!pincode) {
      res.status(404).json({ error: "Pincode not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (place !== undefined) data.place = place?.trim() || null;
    if (district !== undefined) data.district = district?.trim() || null;
    if (state !== undefined) data.state = state?.trim() || null;
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
      select: { id: true, code: true, place: true, district: true, state: true },
    });

    res.json({ pincode: updated });
  } catch (err) {
    console.error("updateMyPincode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/manager/pincodes/:id ──────────────────────────────────────
// Deletes a pincode; disconnects engineers and unassigns legacy users first.
export async function deleteMyPincode(req: Request, res: Response): Promise<void> {
  try {
    const pincodeId = String(req.params.id);

    const pincode = await prisma.pincode.findUnique({ where: { id: pincodeId } });
    if (!pincode) {
      res.status(404).json({ error: "Pincode not found" });
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

// ══════════════════════════════════════════════════════════════════════════
// Dealer CRUD — Service Manager creates/manages dealers
// ══════════════════════════════════════════════════════════════════════════

// ── POST /api/manager/dealers ─────────────────────────────────────────────
export async function createDealer(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, firstName, lastName, warrantyMonths, pincode } = req.body;

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

    // Resolve pincode if provided
    let pincodeId: string | null = null;
    if (pincode?.trim()) {
      const trimmedCode = pincode.trim();
      let pc = await prisma.pincode.findUnique({ where: { code: trimmedCode } });
      if (!pc) {
        pc = await prisma.pincode.create({ data: { code: trimmedCode } });
      }
      pincodeId = pc.id;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const dealer = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role: "dealer",
        warrantyMonths: warrantyMonths != null ? Number(warrantyMonths) : null,
        pincodeId,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, warrantyMonths: true, createdAt: true,
        pincode: { select: { code: true, place: true, district: true, state: true } },
      },
    });

    res.status(201).json({ dealer });
  } catch (err) {
    console.error("createDealer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/manager/dealers ──────────────────────────────────────────────
export async function listDealers(req: Request, res: Response): Promise<void> {
  try {
    const dealers = await prisma.user.findMany({
      where: { role: "dealer" },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        warrantyMonths: true, createdAt: true,
        pincode: { select: { code: true, place: true, district: true, state: true } },
        _count: { select: { dealerTickets: true } },
      },
      orderBy: { firstName: "asc" },
    });

    const result = dealers.map(d => ({
      ...d,
      ticketCount: d._count.dealerTickets,
    }));

    res.setHeader("Cache-Control", "no-store");
    res.json({ dealers: result });
  } catch (err) {
    console.error("listDealers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/manager/dealers/:id ────────────────────────────────────────
export async function updateDealer(req: Request, res: Response): Promise<void> {
  try {
    const dealerId = String(req.params.id);
    const { firstName, lastName, newPassword, warrantyMonths, pincode } = req.body;

    const dealer = await prisma.user.findUnique({ where: { id: dealerId } });
    if (!dealer || dealer.role !== "dealer") {
      res.status(404).json({ error: "Dealer not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (firstName) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName?.trim() ?? null;
    if (warrantyMonths !== undefined) data.warrantyMonths = warrantyMonths != null ? Number(warrantyMonths) : null;
    if (pincode !== undefined) {
      if (pincode && pincode.trim()) {
        const trimmedCode = pincode.trim();
        let pc = await prisma.pincode.findUnique({ where: { code: trimmedCode } });
        if (!pc) {
          pc = await prisma.pincode.create({ data: { code: trimmedCode } });
        }
        data.pincodeId = pc.id;
      } else {
        data.pincodeId = null;
      }
    }
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
      where: { id: dealerId },
      data,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, warrantyMonths: true, createdAt: true,
        pincode: { select: { code: true, place: true, district: true, state: true } },
      },
    });

    res.json({ dealer: updated });
  } catch (err) {
    console.error("updateDealer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/manager/dealers/:id ───────────────────────────────────────
export async function deleteDealer(req: Request, res: Response): Promise<void> {
  try {
    const dealerId = String(req.params.id);

    const dealer = await prisma.user.findUnique({ where: { id: dealerId } });
    if (!dealer || dealer.role !== "dealer") {
      res.status(404).json({ error: "Dealer not found" });
      return;
    }

    // Cascade: unlink dealer's tickets, then delete user
    await prisma.ticket.updateMany({
      where: { dealerId },
      data: { dealerId: null },
    });
    await prisma.user.delete({ where: { id: dealerId } });

    res.json({ message: "Dealer deleted" });
  } catch (err) {
    console.error("deleteDealer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Export — Excel (.xlsx) ticket data for operations tracking
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/manager/export/tickets ───────────────────────────────────────
export async function exportTickets(req: Request, res: Response): Promise<void> {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        customer: { select: { email: true, firstName: true, lastName: true } },
        dealer: { select: { email: true, firstName: true, lastName: true, warrantyMonths: true } },
        assignedEngineer: { select: { email: true, firstName: true, lastName: true } },
        assignedManager: { select: { email: true, firstName: true, lastName: true } },
        pincode: { select: { code: true, place: true, district: true, state: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tickets");

    sheet.columns = [
      { header: "Ticket Number", key: "ticketNumber", width: 22 },
      { header: "Status", key: "status", width: 14 },
      { header: "Customer Name", key: "customerName", width: 22 },
      { header: "Customer Phone", key: "customerPhone", width: 16 },
      { header: "Customer Email", key: "customerEmail", width: 26 },
      { header: "Dealer Name", key: "dealerName", width: 20 },
      { header: "Machine Name", key: "machineName", width: 20 },
      { header: "Serial Number", key: "serialNumber", width: 20 },
      { header: "Product Code", key: "productCode", width: 16 },
      { header: "Warranty (months)", key: "warranty", width: 16 },
      { header: "Place", key: "place", width: 16 },
      { header: "District", key: "district", width: 16 },
      { header: "State", key: "state", width: 16 },
      { header: "Pincode", key: "pincode", width: 10 },
      { header: "Engineer", key: "engineer", width: 20 },
      { header: "Manager", key: "manager", width: 20 },
      { header: "Problem Description", key: "problem", width: 40 },
      { header: "Created At", key: "createdAt", width: 20 },
      { header: "Assigned At", key: "assignedAt", width: 20 },
      { header: "Closed At", key: "closedAt", width: 20 },
      { header: "Response Time (hrs)", key: "responseTime", width: 18 },
      { header: "Resolution Time (hrs)", key: "resolutionTime", width: 18 },
      { header: "OTP Verified", key: "otpVerified", width: 12 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

    for (const t of tickets) {
      const createdAt = new Date(t.createdAt);
      const responseTimeHrs = t.firstEngineeredAt
        ? ((new Date(t.firstEngineeredAt).getTime() - createdAt.getTime()) / 3600000).toFixed(1)
        : "";
      const resolutionTimeHrs = t.closedAt
        ? ((new Date(t.closedAt).getTime() - createdAt.getTime()) / 3600000).toFixed(1)
        : "";

      sheet.addRow({
        ticketNumber: t.ticketNumber,
        status: t.status,
        customerName: t.customer ? `${t.customer.firstName} ${t.customer.lastName ?? ""}`.trim() : "",
        customerPhone: t.phoneNumber ?? "",
        customerEmail: t.customer?.email ?? "",
        dealerName: t.dealer ? `${t.dealer.firstName} ${t.dealer.lastName ?? ""}`.trim() : "",
        machineName: t.machineName ?? "",
        serialNumber: t.machineSerialNumber ?? "",
        productCode: t.machineProductCode ?? "",
        warranty: t.machineWarranty ?? (t.dealer as { warrantyMonths?: number } | null)?.warrantyMonths ?? "",
        place: t.pincode?.place ?? t.place ?? "",
        district: t.pincode?.district ?? t.district ?? "",
        state: t.pincode?.state ?? t.state ?? "",
        pincode: t.pincode?.code ?? "",
        engineer: t.assignedEngineer ? `${t.assignedEngineer.firstName} ${t.assignedEngineer.lastName ?? ""}`.trim() : "",
        manager: t.assignedManager ? `${t.assignedManager.firstName} ${t.assignedManager.lastName ?? ""}`.trim() : "",
        problem: t.problemDescription,
        createdAt: t.createdAt.toISOString().replace("T", " ").slice(0, 19),
        assignedAt: t.firstEngineeredAt ? t.firstEngineeredAt.toISOString().replace("T", " ").slice(0, 19) : "",
        closedAt: t.closedAt ? t.closedAt.toISOString().replace("T", " ").slice(0, 19) : "",
        responseTime: responseTimeHrs,
        resolutionTime: resolutionTimeHrs,
        otpVerified: t.otpVerified ? "Yes" : "No",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets_export_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("exportTickets error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
}
