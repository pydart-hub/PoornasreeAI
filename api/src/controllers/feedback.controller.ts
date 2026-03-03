import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { canAddFeedback, canAccessConversation, type UserRole } from "../lib/permissions";

// ── POST /api/conversations/:id/feedback ──────────────────────────────
// Allowed roles: service, admin, r_and_d
// Body: { correctedAnswer: string, messageId?: string }
//
// Stores a service-manager correction that will be used for future AI
// fine-tuning / RAG pipeline training.
export async function addFeedback(req: Request, res: Response): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const id = req.params.id as string;
    const { correctedAnswer, messageId } = req.body as {
      correctedAnswer?: string;
      messageId?: string;
    };

    // ── Role check ──────────────────────────────────────────────────
    if (!canAddFeedback(role as UserRole)) {
      res.status(403).json({ error: "Only service, admin, and r_and_d may submit feedback" });
      return;
    }

    // ── Input validation ────────────────────────────────────────────
    if (!correctedAnswer?.trim()) {
      res.status(400).json({ error: "correctedAnswer is required" });
      return;
    }

    // ── Verify conversation exists and is accessible ─────────────────
    const conversation = await prisma.conversation.findUnique({ where: { id } });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!canAccessConversation(role as UserRole, conversation.userId, userId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // ── If messageId provided, verify it belongs to this conversation ─
    if (messageId) {
      const message = await prisma.message.findUnique({ where: { id: messageId } });
      if (!message || message.conversationId !== id) {
        res.status(404).json({ error: "Message not found in this conversation" });
        return;
      }
    }

    // ── Persist feedback ────────────────────────────────────────────
    const feedback = await prisma.trainingFeedback.create({
      data: {
        conversationId: id,
        messageId:      messageId ?? null,
        correctedAnswer: correctedAnswer.trim(),
        createdById:    userId,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, role: true } },
      },
    });

    res.status(201).json({ feedback });
  } catch (err) {
    console.error("addFeedback error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
