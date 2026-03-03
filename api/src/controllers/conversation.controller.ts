import { Request, Response } from "express";
import prisma from "../lib/prisma";
import {
  canAccessConversation,
  canDeleteConversation,
  canListAllConversations,
  canManageLifecycle,
  type UserRole,
} from "../lib/permissions";

const VALID_STATUSES = ["open", "in_progress", "resolved", "escalated"] as const;
type ConvStatus = (typeof VALID_STATUSES)[number];

// ── POST /api/conversations ───────────────────────────────────────────
export async function createConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { title } = req.body;

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title: title?.trim() || "New conversation",
      },
      include: { messages: true },
    });

    res.status(201).json({ conversation });
  } catch (err) {
    console.error("createConversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/conversations ────────────────────────────────────────────
export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const showAll = canListAllConversations(role as UserRole);

    const conversations = await prisma.conversation.findMany({
      where: showAll ? undefined : { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    res.json({ conversations });
  } catch (err) {
    console.error("listConversations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/conversations/:id ────────────────────────────────────────
export async function getConversation(req: Request, res: Response): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const id = req.params.id as string;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!canAccessConversation(role as UserRole, conversation.userId, userId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json({ conversation });
  } catch (err) {
    console.error("getConversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── DELETE /api/conversations/:id ─────────────────────────────────────
export async function deleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const id = req.params.id as string;

    const conversation = await prisma.conversation.findUnique({ where: { id } });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!canDeleteConversation(role as UserRole, conversation.userId, userId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await prisma.conversation.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("deleteConversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/conversations/:id/status ───────────────────────────────
// Allowed: service, admin only.
// Body: { status: "open" | "in_progress" | "resolved" | "escalated" }
export async function updateStatus(req: Request, res: Response): Promise<void> {
  try {
    const { role } = req.user!;
    const id = req.params.id as string;
    const { status } = req.body as { status?: string };

    if (!canManageLifecycle(role as UserRole)) {
      res.status(403).json({ error: "Only service and admin may update conversation status" });
      return;
    }

    if (!status || !VALID_STATUSES.includes(status as ConvStatus)) {
      res.status(400).json({
        error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      });
      return;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        status,
        // When explicitly setting escalated status, also flip the boolean flag
        ...(status === "escalated" ? { escalated: true } : {}),
      },
    });

    res.json({ conversation: updated });
  } catch (err) {
    console.error("updateStatus error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/conversations/:id/escalate ──────────────────────────────
// Allowed: service, admin only.
// Sets status = "escalated" and escalated = true.
export async function escalateConversation(req: Request, res: Response): Promise<void> {
  try {
    const { role } = req.user!;
    const id = req.params.id as string;

    if (!canManageLifecycle(role as UserRole)) {
      res.status(403).json({ error: "Only service and admin may escalate conversations" });
      return;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (conversation.escalated) {
      res.status(409).json({ error: "Conversation is already escalated" });
      return;
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: "escalated", escalated: true },
    });

    res.json({ conversation: updated });
  } catch (err) {
    console.error("escalateConversation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
