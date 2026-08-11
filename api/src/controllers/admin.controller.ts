// ── Admin Controller ─────────────────────────────────────────────────────
// All handlers here are admin-only (enforced in routes via `protect`).

import { Request, Response } from "express";
import fs from "fs";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendEngineerSetupNotification } from "../services/engineer-onboarding.service";
import { runtime } from "../services/runtime-config.service";
import prisma from "../lib/prisma";
import { processDocument } from "../services/document.service";
import { deleteVectorsByDocumentId } from "../services/vector.service";
import { upsertPincode, importDealersFromExcel, deleteAllDealers } from "../services/dealerImport.service";
import { clearCustomerByPhone } from "../services/customer-clear.service";
import * as WhatsAppService from "../services/whatsapp.service";

const SALT_ROUNDS = 12;

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateSetupToken(): { rawToken: string; tokenHash: string; tokenExpiry: Date } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + SETUP_TOKEN_TTL_MS);
  return { rawToken, tokenHash, tokenExpiry };
}

function buildSetPasswordUrl(rawToken: string): string {
  return `${runtime.frontendUrl()}/set-password?token=${rawToken}`;
}

const VALID_ROLES = ["admin", "service", "service_manager", "assistant_service_manager", "service_engineer", "sales", "dealer", "customer_service", "customer_support", "marketing"];

// ── POST /api/admin/users ────────────────────────────────────────────────
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const { email, password, firstName, lastName, role, whatsappNumber, pincode, pincodeIds, city, state } = req.body;

    if (!email || (!password && role !== "service_engineer") || !firstName || !role) {
      res.status(400).json({ error: "Missing required fields: email, password, firstName, role" });
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }

    if (password && password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    let pincodeId: string | null = null;
    if (role === "dealer" && pincode?.trim()) {
      pincodeId = await upsertPincode(pincode.trim(), city?.trim() || null, state?.trim() || null);
    }

    const passwordHash = await bcrypt.hash(password || crypto.randomBytes(32).toString("hex"), SALT_ROUNDS);
    
    let setupData = {};
    let rawTokenStr = "";
    if (role === "service_engineer") {
      const { rawToken, tokenHash, tokenExpiry } = generateSetupToken();
      rawTokenStr = rawToken;
      setupData = {
        setPasswordToken: tokenHash,
        setPasswordTokenExpiry: tokenExpiry,
      };
    }
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role,
        ...setupData,
        ...((role === "dealer" || role === "service_engineer") && whatsappNumber
          ? { whatsappNumber: WhatsAppService.normalizeWhatsappNumber(whatsappNumber) || whatsappNumber.trim().replace(/^\+/, "") }
          : {}),
        ...(role === "dealer" && pincodeId ? { pincodeId } : {}),
        ...(role === "service_engineer" && Array.isArray(pincodeIds) && pincodeIds.length > 0
          ? { engineerPincodes: { connect: pincodeIds.map((id: string) => ({ id })) } }
          : {}),
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true,
        whatsappNumber: true,
        pincode: { select: { code: true, place: true, state: true } },
        engineerPincodes: { select: { code: true } },
      },
    });

    let setPasswordUrl;
    if (role === "service_engineer" && rawTokenStr) {
      setPasswordUrl = buildSetPasswordUrl(rawTokenStr);
      if (user.whatsappNumber) {
        await sendEngineerSetupNotification(
          { 
            firstName: user.firstName, 
            email: user.email, 
            whatsappNumber: user.whatsappNumber,
            pincodes: user.engineerPincodes?.map((p: any) => p.code) || []
          },
          rawTokenStr,
          "Admin"
        );
      }
    }
    
    res.status(201).json({ user, setPasswordUrl });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/users ─────────────────────────────────────────────────
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const users = await prisma.user.findMany({
      where: { role: { not: "customer" } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        whatsappNumber: true,
        pincode: { select: { code: true, place: true, state: true } },
        _count: { select: { conversations: true } },
        engineerPincodes: { select: { id: true, code: true, place: true, district: true, state: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ users });
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/registered-customers ──────────────────────────────────
export async function listRegisteredCustomers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    // Fetch all users with role=customer
    const customers = await prisma.user.findMany({
      where: { role: "customer" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        whatsappNumber: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch the latest conversation session per phone to get registration metadata
    // (regSerialNumber, regMachineData, regPincode, regPlace, regDistrict, regState, regGmapLink)
    const phoneNumbers = customers.map(c => c.whatsappNumber || "").filter(Boolean);

    // Get latest session per phone (all sessions — isRegistered may not be set for old records)
    const sessions = await prisma.conversationSession.findMany({
      where: {
        phoneNumber: { in: phoneNumbers },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        phoneNumber: true,
        isRegistered: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Group by phoneNumber, keep the latest session per phone
    const latestSessionByPhone = new Map<string, typeof sessions[0]>();
    for (const s of sessions) {
      if (!latestSessionByPhone.has(s.phoneNumber)) {
        latestSessionByPhone.set(s.phoneNumber, s);
      }
    }

    // Build enriched result
    const result = customers.map(customer => {
      const phone = customer.whatsappNumber || "";
      const session = latestSessionByPhone.get(phone);
      const meta: any = session?.metadata ? JSON.parse(JSON.stringify(session.metadata)) : {};

      return {
        id: customer.id,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Customer",
        phone,
        email: customer.email,
        createdAt: customer.createdAt,
        registeredAt: session?.createdAt ?? null,
        updatedAt: session?.updatedAt ?? null,
        serialNumber: meta.regSerialNumber || null,
        machineModel: meta.regMachineData?.m_model || null,
        machineCustomer: meta.regMachineData?.customer || null,
        address: meta.regAddress || null,
        pincode: meta.regPincode || null,
        place: meta.regPlace || null,
        district: meta.regDistrict || null,
        state: meta.regState || null,
        googleMapLink: meta.regGmapLink || null,
        productCode: meta.regMachineData?.product_code || null,
        invoiceDate: meta.regMachineData?.invoice_date || null,
        warrantyMonths: meta.regMachineData?.warranty_months || null,
      };
    });

    res.json({ customers: result, total: result.length });
  } catch (err) {
    console.error("listRegisteredCustomers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────
export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const id = req.params.id as string;

    if (id === req.user.userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Block deletion of a service engineer who still has active tickets
    if (user.role === "service_engineer") {
      const activeTickets = await prisma.ticket.findMany({
        where: {
          assignedEngineerId: id,
          status: { in: ["ASSIGNED", "IN_PROGRESS", "PENDING_OTP"] },
        },
        select: { id: true, ticketNumber: true, status: true },
      });
      if (activeTickets.length > 0) {
        res.status(400).json({
          error: `Cannot delete — ${activeTickets.length} active ticket(s) are still assigned to this engineer. Reassign them first.`,
          activeTickets,
        });
        return;
      }
    }

    // Delete in a transaction, manually removing/unlinking related records that lack
    // onDelete: Cascade in the schema to avoid FK constraint violations.
    await prisma.$transaction(async (tx) => {
      // Unassign engineer from any support requests (engineerId is nullable)
      await tx.supportRequest.updateMany({
        where: { engineerId: id },
        data: { engineerId: null },
      });

      // Unassign user from tickets where they are set as dealer, assigned dealer, assigned manager, or assigned engineer
      await tx.ticket.updateMany({ where: { dealerId: id }, data: { dealerId: null } });
      await tx.ticket.updateMany({ where: { assignedDealerId: id }, data: { assignedDealerId: null } });
      await tx.ticket.updateMany({ where: { assignedManagerId: id }, data: { assignedManagerId: null } });
      await tx.ticket.updateMany({ where: { assignedEngineerId: id }, data: { assignedEngineerId: null } });

      // Unlink managed engineers (if deleting a manager)
      await tx.user.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      });

      // Delete work reports submitted by this user (if dealer)
      await tx.workReport.deleteMany({ where: { dealerId: id } });

      // Delete support messages sent by this user
      await tx.supportMessage.deleteMany({ where: { senderId: id } });

      // Delete training feedback authored by this user
      await tx.trainingFeedback.deleteMany({ where: { createdById: id } });

      // Delete documents uploaded by this user (chunks cascade automatically)
      await tx.document.deleteMany({ where: { uploadedById: id } });

      // Delete R&D videos uploaded by this user
      await tx.rdVideo.deleteMany({ where: { uploadedById: id } });

      // Clear any WhatsApp conversation session associated with this user's phone number
      if (user.whatsappNumber) {
        const cleanPhone = user.whatsappNumber.replace(/\D/g, "");
        const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
        await tx.conversationSession.deleteMany({
          where: {
            OR: [
              { phoneNumber: user.whatsappNumber },
              { phoneNumber: { contains: last10 } },
            ],
          },
        });
      }

      // Delete the user — conversations, messages, customerRequests, and
      // their nested records cascade via existing onDelete: Cascade directives.
      await tx.user.delete({ where: { id } });
    });

    res.json({ message: "User deleted" });
  } catch (err: unknown) {
    console.error("deleteUser error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
}

// ── PATCH /api/admin/users/:id ──────────────────────────────────────────
export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const id = req.params.id as string;
    const { firstName, lastName, email, newPassword, role, whatsappNumber, pincode, pincodeIds, city, state } = req.body;

    if (!firstName && !lastName && !email && !newPassword && !role
        && whatsappNumber === undefined && pincode === undefined
        && city === undefined && state === undefined) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Build update payload
    const data: Record<string, unknown> = {};
    if (firstName) data.firstName = firstName.trim();
    if (lastName !== undefined) data.lastName = lastName?.trim() ?? null;
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const conflict = await prisma.user.findFirst({
        where: { email: normalizedEmail, NOT: { id } },
      });
      if (conflict) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      data.email = normalizedEmail;
    }
    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }
      data.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }
    if (role) {
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
        return;
      }
      data.role = role;
    }

    const effectiveRole = (role as string) || target.role;
    if (effectiveRole === "service_engineer") {
      if (whatsappNumber !== undefined) {
        data.whatsappNumber = whatsappNumber ? (WhatsAppService.normalizeWhatsappNumber(whatsappNumber) || whatsappNumber.trim().replace(/^\+/, "")) : null;
      }
      if (pincodeIds !== undefined && Array.isArray(pincodeIds)) {
        data.engineerPincodes = { set: pincodeIds.map((id: string) => ({ id })) };
      }
    } else if (effectiveRole === "dealer") {
      if (whatsappNumber !== undefined) {
        data.whatsappNumber = whatsappNumber ? (WhatsAppService.normalizeWhatsappNumber(whatsappNumber) || whatsappNumber.trim().replace(/^\+/, "")) : null;
      }
      if (pincode !== undefined) {
        if (pincode && pincode.trim()) {
          data.pincodeId = await upsertPincode(pincode.trim(), city?.trim() || null, state?.trim() || null);
        } else {
          data.pincodeId = null;
        }
      } else if (city !== undefined || state !== undefined) {
        const current = await prisma.user.findUnique({
          where: { id },
          select: { pincode: { select: { code: true, place: true, state: true } } },
        });
        if (current?.pincode?.code) {
          data.pincodeId = await upsertPincode(
            current.pincode.code,
            city !== undefined ? (city?.trim() || null) : current.pincode.place,
            state !== undefined ? (state?.trim() || null) : current.pincode.state,
          );
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true,
        whatsappNumber: true,
        pincode: { select: { code: true, place: true, state: true } },
      },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/documents ─────────────────────────────────────────────
export async function listDocuments(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const documents = await prisma.document.findMany({
      include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
          _count: { select: { chunks: true } },
          issues: {
            include: { steps: { orderBy: { stepNumber: "asc" } } }
          }
        },
      orderBy: { createdAt: "desc" },
    });

    const result = documents.map((d) => ({
      id: d.id,
      title: d.title,
      filePath: d.filePath,
      documentType: d.documentType,
      createdAt: d.createdAt,
      uploadedBy: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName ?? ""}`.trim(),
      chunkCount: d._count.chunks,
      status: d._count.chunks > 0 ? "trained" : "pending",
    }));

    res.json({ documents: result });
  } catch (err) {
    console.error("listDocuments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/documents/:id ─────────────────────────────────────
export async function deleteDocumentRecord(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const id = req.params.id as string;

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    // Delete DB record (cascades to DocumentChunk)
    await prisma.document.delete({ where: { id } });

    // Remove file from disk if it exists
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/documents/reindex
 * Re-processes all existing documents: deletes old chunks/vectors and
 * re-runs the embedding pipeline with improved chunking.
 */
export async function reindexDocuments(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const documents = await prisma.document.findMany();
    if (documents.length === 0) {
      res.json({ message: "No documents to reindex", results: [] });
      return;
    }

    const results: Array<{ id: string; title: string; status: string; detail?: any }> = [];

    for (const doc of documents) {
      try {
        // 1. Delete old vectors from Qdrant
        await deleteVectorsByDocumentId(doc.id);

        // 2. Delete old chunks from DB
        await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });

        // 3. Determine mimetype from file extension
        const ext = doc.filePath.split(".").pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          pdf: "application/pdf",
          json: "application/json",
          csv: "text/csv",
          txt: "text/plain",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          xls: "application/vnd.ms-excel",
        };
        const mimetype = mimeMap[ext ?? ""] || "application/pdf";

        // 4. Re-process with improved chunking
        if (!fs.existsSync(doc.filePath)) {
          results.push({ id: doc.id, title: doc.title, status: "skipped", detail: "File not found on disk" });
          continue;
        }

        const result = await processDocument(doc.id, doc.filePath, mimetype, doc.documentType);
        results.push({ id: doc.id, title: doc.title, status: "ok", detail: result });
      } catch (err: any) {
        console.error(`[reindex] Failed for doc ${doc.id}:`, err?.message);
        results.push({ id: doc.id, title: doc.title, status: "error", detail: err?.message });
      }
    }

    res.json({ message: `Reindexed ${results.filter(r => r.status === "ok").length}/${documents.length} documents`, results });
  } catch (err) {
    console.error("reindexDocuments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/dealers/all ─────────────────────────────────────────
export async function deleteAllDealersAdmin(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const deleted = await deleteAllDealers();
    res.json({ deleted, message: `Deleted ${deleted} dealer(s)` });
  } catch (err) {
    console.error("deleteAllDealersAdmin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/admin/import/dealers ───────────────────────────────────────
export async function importDealersAdmin(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const replaceAll = req.body?.replaceAll !== "false" && req.body?.replaceAll !== false
      && req.query?.replaceAll !== "false";

    const result = await importDealersFromExcel(req.file.buffer, replaceAll);

    res.json({
      deleted: result.deleted,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      skippedEmails: [...result.skippedEmails, ...result.errorMessages.slice(0, 20)],
    });
  } catch (err) {
    console.error("importDealersAdmin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/admin/test/customer ───────────────────────────────────────
// Temporary testing helper: wipe tickets + WhatsApp sessions for one phone.
export async function clearTestCustomer(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const phone = String(req.body?.phoneNumber ?? req.query?.phoneNumber ?? "").trim();
    const result = await clearCustomerByPhone(phone);
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Internal server error" });
  }
}
