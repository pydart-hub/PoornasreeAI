// ── Sales Controller ──────────────────────────────────────────────────────
// All handlers are sales-role only (enforced here + in routes via `protect`).
// Sales can manage CUSTOMER accounts only — create, read, update, delete.

import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { getAnalytics as _getAnalytics } from "./support.controller";

const SALT_ROUNDS = 12;

// ── Helper: guard that target user is a customer ─────────────────────────
async function requireCustomerTarget(
  id: string,
  res: Response
): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return false;
  }
  if (target.role !== "customer") {
    res.status(403).json({ error: "Sales can only manage customer accounts" });
    return false;
  }
  return true;
}

// ── GET /api/sales/users ─────────────────────────────────────────────────
// Sales can see only customer accounts.
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "sales") {
      res.status(403).json({ error: "Sales only" });
      return;
    }

    const users = await prisma.user.findMany({
      where: { role: "customer" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ users });
  } catch (err) {
    console.error("sales.listUsers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/sales/users ────────────────────────────────────────────────
// Sales can only create customers.
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "sales") {
      res.status(403).json({ error: "Sales only" });
      return;
    }

    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName) {
      res.status(400).json({ error: "Missing required fields: email, password, firstName" });
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

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName?.trim() ?? null,
        role: "customer", // always customer — sales cannot set another role
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error("sales.createUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/sales/users/:id ───────────────────────────────────────────
// Edit a customer's details. Target must be role=customer.
// newPassword is optional — only updated if provided and non-empty.
export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "sales") {
      res.status(403).json({ error: "Sales only" });
      return;
    }

    const id = req.params.id as string;
    if (!(await requireCustomerTarget(id, res))) return;

    const { firstName, lastName, email, newPassword } = req.body;

    if (!firstName && lastName === undefined && !email && !newPassword) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

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

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error("sales.updateUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/sales/users/:id ──────────────────────────────────────────
// Delete a customer account. Target must be role=customer.
export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "sales") {
      res.status(403).json({ error: "Sales only" });
      return;
    }

    const id = req.params.id as string;

    if (id === req.user.userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    // Collect all phone lookup variants
    const phoneVariants = new Set<string>();
    if (user.whatsappNumber) {
      phoneVariants.add(user.whatsappNumber);
      const clean = user.whatsappNumber.replace(/\D/g, "");
      if (clean) {
        phoneVariants.add(clean);
        phoneVariants.add(`91${clean}`);
        phoneVariants.add(`+91${clean}`);
        if (clean.length >= 10) {
          const last10 = clean.slice(-10);
          phoneVariants.add(last10);
          phoneVariants.add(`91${last10}`);
          phoneVariants.add(`+91${last10}`);
        }
      }
    }
    const lookupPhones = [...phoneVariants];

    await prisma.$transaction(async (tx) => {
      // Find all tickets associated with this customer ID or phone number variants
      const customerTickets = await tx.ticket.findMany({
        where: {
          OR: [
            { customerId: id },
            ...(lookupPhones.length > 0 ? [{ phoneNumber: { in: lookupPhones } }] : []),
          ],
        },
        select: { id: true },
      });
      const ticketIds = customerTickets.map((t) => t.id);

      if (ticketIds.length > 0) {
        // Delete work reports on these tickets
        await tx.workReport.deleteMany({ where: { ticketId: { in: ticketIds } } });
        // Delete the tickets
        await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      }

      await tx.ticket.updateMany({ where: { dealerId: id }, data: { dealerId: null } });
      await tx.ticket.updateMany({ where: { assignedDealerId: id }, data: { assignedDealerId: null } });
      await tx.ticket.updateMany({ where: { assignedManagerId: id }, data: { assignedManagerId: null } });
      await tx.ticket.updateMany({ where: { assignedEngineerId: id }, data: { assignedEngineerId: null } });

      await tx.workReport.deleteMany({ where: { dealerId: id } });
      await tx.supportMessage.deleteMany({ where: { senderId: id } });
      await tx.trainingFeedback.deleteMany({ where: { createdById: id } });
      await tx.document.deleteMany({ where: { uploadedById: id } });

      // Delete support requests initiated by this customer
      await tx.supportRequest.deleteMany({
        where: { customerId: id },
      });

      // Clear any WhatsApp conversation session and simulate messages associated with this user's phone number
      if (lookupPhones.length > 0) {
        await tx.conversationSession.deleteMany({
          where: {
            phoneNumber: { in: lookupPhones },
          },
        });
        await tx.simulateMessage.deleteMany({
          where: {
            phoneNumber: { in: lookupPhones },
          },
        });
      }

      await tx.user.delete({ where: { id } });
    });

    res.json({ message: "Customer deleted" });
  } catch (err: unknown) {
    console.error("sales.deleteUser error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
}

// ── GET /api/sales/analytics ─────────────────────────────────────────────
// Re-export the shared analytics handler (already implemented in support.controller).
export { _getAnalytics as getAnalytics };

// ── GET /api/sales/feedback ──────────────────────────────────────────────
// Return recent training feedback entries for customer conversations.
export async function getCustomerFeedback(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "sales") {
      res.status(403).json({ error: "Sales only" });
      return;
    }

    const feedback = await prisma.trainingFeedback.findMany({
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ feedback });
  } catch (err) {
    console.error("sales.getCustomerFeedback error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
