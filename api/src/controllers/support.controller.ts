// ── Support Controller ────────────────────────────────────────────────────
// Handles the human-support escalation queue:
//   Customer → creates SupportRequest
//   Engineer → accepts, chats in real-time, resolves
//   Admin    → analytics

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { io } from "../lib/socket";
import { embedText, searchVectors } from "../services/vector.service";

// ── POST /api/support/requests ───────────────────────────────────────────
// Customer creates a support request (escalates from AI chat)
export async function createSupportRequest(req: Request, res: Response): Promise<void> {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can raise support requests" });
      return;
    }

    const userId               = req.user!.userId;
    const { problem, machineName, conversationId } = req.body;

    if (!problem?.trim() || !conversationId) {
      res.status(400).json({ error: "problem and conversationId are required" });
      return;
    }

    // Verify conversation belongs to this customer
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const request = await prisma.supportRequest.create({
      data: {
        customerId:     userId,
        conversationId,
        problem:        problem.trim(),
        machineName:    machineName?.trim() || null,
        status:         "pending",
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Notify all online engineers
    io?.to("engineers").emit("request:new", request);

    res.status(201).json({ request });
  } catch (err) {
    console.error("createSupportRequest:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/support/requests ────────────────────────────────────────────
// Engineers see all (filtered by status); customers see their own
export async function listSupportRequests(req: Request, res: Response): Promise<void> {
  try {
    const userId     = req.user!.userId;
    const role       = req.user!.role;
    const statusQ    = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (statusQ && statusQ !== "all") where.status = statusQ;
    if (role === "customer") where.customerId = userId;

    const requests = await prisma.supportRequest.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        engineer: { select: { id: true, firstName: true, lastName: true } },
        _count:   { select: { chatMessages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ requests });
  } catch (err) {
    console.error("listSupportRequests:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/support/requests/:id/accept ──────────────────────────────
// Engineer accepts a pending support request
export async function acceptSupportRequest(req: Request, res: Response): Promise<void> {
  try {
    const role       = req.user!.role;
    const engineerId = req.user!.userId;

    if (!["service", "admin"].includes(role)) {
      res.status(403).json({ error: "Service engineers only" });
      return;
    }

    const id = req.params.id as string;
    const existing = await prisma.supportRequest.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status !== "pending") {
      res.status(400).json({ error: "Request is no longer pending" });
      return;
    }

    const request = await prisma.supportRequest.update({
      where: { id },
      data:  { engineerId, status: "active" },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        engineer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify the customer that an engineer has accepted
    io?.to(`user:${request.customerId}`).emit("request:accepted", {
      requestId: id,
      engineer:  (request as typeof request & { engineer: unknown }).engineer,
    });
    // Notify all engineers so they update the queue state
    io?.to("engineers").emit("request:updated", request);

    res.json({ request });
  } catch (err) {
    console.error("acceptSupportRequest:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── PATCH /api/support/requests/:id/resolve ─────────────────────────────
export async function resolveSupportRequest(req: Request, res: Response): Promise<void> {
  try {
    if (!["service", "admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Service engineers only" });
      return;
    }

    const id = req.params.id as string;
    const request = await prisma.supportRequest.update({
      where: { id },
      data:  { status: "resolved" },
      include: { customer: { select: { id: true } } },
    });

    // Notify the customer that their issue was resolved
    io?.to(`sr:${id}`).emit("request:resolved", { requestId: id });

    res.json({ request });
  } catch (err) {
    console.error("resolveSupportRequest:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/support/requests/:id/messages ──────────────────────────────
export async function getSupportMessages(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const role   = req.user!.role;
    const id     = req.params.id as string;

    const request = await prisma.supportRequest.findUnique({ where: { id } });
    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    // Customers can only see their own; engineers see all
    const canAccess =
      request.customerId === userId ||
      request.engineerId === userId ||
      ["service", "admin"].includes(role);
    if (!canAccess) { res.status(403).json({ error: "Access denied" }); return; }

    const messages = await prisma.supportMessage.findMany({
      where:   { supportRequestId: id },
      include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({ messages });
  } catch (err) {
    console.error("getSupportMessages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/support/requests/:id/messages ─────────────────────────────
// Both customer and engineer send real-time support messages
export async function sendSupportMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId  = req.user!.userId;
    const id      = req.params.id as string;
    const { content } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const request = await prisma.supportRequest.findUnique({ where: { id } });
    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    const canSend = request.customerId === userId || request.engineerId === userId;
    if (!canSend) { res.status(403).json({ error: "Access denied" }); return; }

    const message = await prisma.supportMessage.create({
      data:    { supportRequestId: id, senderId: userId, content: content.trim() },
      include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    // Real-time delivery to both parties in the request room
    io?.to(`sr:${id}`).emit("chat:message", { requestId: id, message });

    res.status(201).json({ message });
  } catch (err) {
    console.error("sendSupportMessage:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── POST /api/support/ai-insight ────────────────────────────────────────
// Feature 6: AI diagnosis for engineers — vector search on customer problem
export async function getAiInsight(req: Request, res: Response): Promise<void> {
  try {
    if (!["service", "admin"].includes(req.user!.role)) {
      res.status(403).json({ error: "Service engineers only" });
      return;
    }

    const { query, problem } = req.body;
    const searchQuery = (query || problem || "").trim();
    if (!searchQuery) { res.status(400).json({ error: "query is required" }); return; }

    const embedding      = await embedText(searchQuery);
    const hits           = await searchVectors(embedding, 3, ["service", "customer"]);
    const relevantHits   = hits.filter((h) => h.score >= 0.35);

    const insights = relevantHits.map((h, i) => ({
      rank:       i + 1,
      score:      Math.round(h.score * 100),
      snippet:    (h.payload.content as string || "").slice(0, 300),
      documentId: h.payload.documentId as string,
    }));

    const topScore   = insights[0]?.score ?? 0;
    const confidence = topScore >= 75 ? "high" : topScore >= 50 ? "medium" : "low";

    const suggestedChecks = insights
      .slice(0, 2)
      .map((ins) => ins.snippet.split(/\n/)[0]?.slice(0, 120) || "")
      .filter(Boolean);

    res.json({ insights, confidence, suggestedChecks });
  } catch (err) {
    console.error("getAiInsight:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/analytics ─────────────────────────────────────────────
// Feature 7: Admin analytics dashboard data
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  try {
    if (!["admin", "sales"].includes(req.user?.role ?? "")) {
      res.status(403).json({ error: "Admins and sales only" });
      return;
    }

    const [
      totalConversations,
      totalSupportRequests,
      supportByStatus,
      topMachines,
      recentIssues,
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.supportRequest.count(),
      prisma.supportRequest.groupBy({
        by:      ["status"],
        _count:  { status: true },
      }),
      prisma.supportRequest.groupBy({
        by:      ["machineName"],
        _count:  { machineName: true },
        orderBy: { _count: { machineName: "desc" } },
        take:    6,
        where:   { machineName: { not: null } },
      }),
      prisma.supportRequest.findMany({
        take:    8,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const statusMap = supportByStatus.reduce<Record<string, number>>(
      (acc: Record<string, number>, s: { status: string; _count: { status: number } }) =>
        ({ ...acc, [s.status]: s._count.status }), {}
    );

    const escalationRate = totalConversations > 0
      ? Math.round((totalSupportRequests / totalConversations) * 100) : 0;
    const aiResolutionRate = totalConversations > 0
      ? Math.round(((totalConversations - totalSupportRequests) / totalConversations) * 100) : 100;

    res.json({
      totalConversations,
      totalSupportRequests,
      escalationRate,
      aiResolutionRate,
      resolvedCount:  statusMap["resolved"]  ?? 0,
      pendingCount:   statusMap["pending"]   ?? 0,
      activeCount:    statusMap["active"]    ?? 0,
      topMachines:    topMachines.map((m: { machineName: string | null; _count: { machineName: number } }) => ({ name: m.machineName!, count: m._count.machineName })),
      recentIssues,
    });
  } catch (err) {
    console.error("getAnalytics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/analytics/timeline ───────────────────────────────────
// Returns daily conversation + support counts for the past 30 days.
export async function getAnalyticsTimeline(req: Request, res: Response): Promise<void> {
  try {
    if (!["admin", "sales"].includes(req.user?.role ?? "")) {
      res.status(403).json({ error: "Admins and sales only" });
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 29); // last 30 days inclusive
    since.setHours(0, 0, 0, 0);

    const [conversations, supportRequests] = await Promise.all([
      prisma.conversation.findMany({
        where:  { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.supportRequest.findMany({
        where:  { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    // Build date buckets for the past 30 days
    const buckets: Record<string, { date: string; conversations: number; support: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, conversations: 0, support: 0 };
    }

    conversations.forEach((c: { createdAt: Date }) => {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].conversations += 1;
    });

    supportRequests.forEach((s: { createdAt: Date }) => {
      const key = s.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].support += 1;
    });

    res.json({ timeline: Object.values(buckets) });
  } catch (err) {
    console.error("getAnalyticsTimeline:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
