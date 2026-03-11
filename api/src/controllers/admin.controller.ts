// ── Admin Controller ─────────────────────────────────────────────────────
// All handlers here are admin-only (enforced in routes via `protect`).

import { Request, Response } from "express";
import fs from "fs";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";

const SALT_ROUNDS = 12;
const VALID_ROLES = ["admin", "customer", "service", "sales"];

// ── POST /api/admin/users ────────────────────────────────────────────────
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !role) {
      res.status(400).json({ error: "Missing required fields: email, password, firstName, role" });
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
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
        role,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    res.status(201).json({ user });
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
    console.error("listUsers error:", err);
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

    await prisma.user.delete({ where: { id } });
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Internal server error" });
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
    const { firstName, lastName, email, newPassword } = req.body;

    if (!firstName && !lastName && !email && !newPassword) {
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

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
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
