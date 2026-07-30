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

    if (!["service", "admin", "customer_service"].includes(role)) {
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
    if (!["service", "admin", "customer_service"].includes(req.user!.role)) {
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
      ["service", "admin", "customer_service"].includes(role);
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
    if (!["service", "admin", "customer_service"].includes(req.user!.role)) {
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

// ── Helper: extract top keywords from an array of texts ─────────────────
function extractTopKeywords(texts: string[], topN = 12): { keyword: string; count: number }[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "it", "in", "on", "at", "to", "for", "of", "and", "or", "but",
    "my", "i", "we", "you", "he", "she", "they", "this", "that", "with", "not", "can",
    "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "its", "our", "your", "their",
    "from", "by", "as", "up", "about", "into", "through", "during", "before", "after",
    "how", "what", "when", "where", "why", "which", "who", "so", "if", "then", "than",
    "no", "yes", "all", "any", "some", "such", "also", "just", "like", "please", "hi",
    "hello", "hey", "need", "want", "get", "got", "getting", "me", "tell", "know",
    "use", "using", "used", "make", "made", "making", "help", "show", "give", "hei",
  ]);
  const freq: Record<string, number> = {};
  for (const text of texts) {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const word of words) {
      if (!stopWords.has(word)) freq[word] = (freq[word] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([keyword, count]) => ({ keyword, count }));
}

// ── GET /api/admin/analytics/customer ────────────────────────────────────
export async function getCustomerAnalytics(req: Request, res: Response): Promise<void> {
  try {
    if (!["admin", "sales", "customer_service"].includes(req.user?.role ?? "")) {
      res.status(403).json({ error: "Admins, sales and customer service only" });
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const [
      totalConversations,
      totalSupportRequests,
      supportByStatus,
      supportProblems,
      recentCustomerMessages,
      recentIssues,
      convTimeline,
      supportTimeline,
    ] = await Promise.all([
      prisma.conversation.count({ where: { user: { role: "customer" } } }),
      prisma.supportRequest.count(),
      prisma.supportRequest.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.supportRequest.findMany({
        select: { problem: true },
        take: 300,
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.findMany({
        where: { role: "user", conversation: { user: { role: "customer" } } },
        select: { content: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportRequest.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: { firstName: true, lastName: true } } },
      }),
      prisma.conversation.findMany({
        where: { user: { role: "customer" }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.supportRequest.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const statusMap = supportByStatus.reduce<Record<string, number>>(
      (acc: Record<string, number>, s: { status: string; _count: { status: number } }) =>
        ({ ...acc, [s.status]: s._count.status }), {}
    );

    // Build timeline buckets for last 30 days
    const buckets: Record<string, { date: string; conversations: number; support: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, conversations: 0, support: 0 };
    }
    convTimeline.forEach((c: { createdAt: Date }) => {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].conversations += 1;
    });
    supportTimeline.forEach((s: { createdAt: Date }) => {
      const key = s.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].support += 1;
    });

    res.json({
      totalConversations,
      totalSupportRequests,
      resolvedCount: statusMap["resolved"] ?? 0,
      pendingCount:  statusMap["pending"]  ?? 0,
      activeCount:   statusMap["active"]   ?? 0,
      topComplaints: extractTopKeywords(supportProblems.map((s: { problem: string }) => s.problem)),
      topQuestions:  extractTopKeywords(recentCustomerMessages.map((m: { content: string }) => m.content)),
      recentIssues,
      timeline: Object.values(buckets),
    });
  } catch (err) {
    console.error("getCustomerAnalytics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/analytics/service ─────────────────────────────────────
export async function getServiceAnalytics(req: Request, res: Response): Promise<void> {
  try {
    if (!["admin", "sales"].includes(req.user?.role ?? "")) {
      res.status(403).json({ error: "Admins and sales only" });
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const [
      totalConversations,
      topMachines,
      recentServiceMessages,
      supportByStatus,
      convTimeline,
    ] = await Promise.all([
      prisma.conversation.count({ where: { user: { role: "service" } } }),
      prisma.supportRequest.groupBy({
        by:      ["machineName"],
        _count:  { machineName: true },
        orderBy: { _count: { machineName: "desc" } },
        take:    8,
        where:   { machineName: { not: null } },
      }),
      prisma.message.findMany({
        where: { role: "user", conversation: { user: { role: "service" } } },
        select: { content: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportRequest.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.conversation.findMany({
        where: { user: { role: "service" }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const statusMap = supportByStatus.reduce<Record<string, number>>(
      (acc: Record<string, number>, s: { status: string; _count: { status: number } }) =>
        ({ ...acc, [s.status]: s._count.status }), {}
    );

    // Build timeline buckets for last 30 days
    const buckets: Record<string, { date: string; conversations: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, conversations: 0 };
    }
    convTimeline.forEach((c: { createdAt: Date }) => {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].conversations += 1;
    });

    res.json({
      totalConversations,
      topMachines: topMachines.map((m: { machineName: string | null; _count: { machineName: number } }) => ({
        name:  m.machineName!,
        count: m._count.machineName,
      })),
      topTopics:     extractTopKeywords(recentServiceMessages.map((m: { content: string }) => m.content)),
      resolvedCount: statusMap["resolved"] ?? 0,
      pendingCount:  statusMap["pending"]  ?? 0,
      activeCount:   statusMap["active"]   ?? 0,
      timeline:      Object.values(buckets),
    });
  } catch (err) {
    console.error("getServiceAnalytics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── WhatsApp chatbot analytics helpers ───────────────────────────────────

function waPhoneKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

type WaLocation = {
  state: string;
  district: string;
  place: string;
  pincode: string | null;
};

const UNKNOWN_LOCATION: WaLocation = {
  state: "Unknown",
  district: "Unknown",
  place: "Unknown",
  pincode: null,
};

function locationFromSessionMetadata(metadata: unknown): WaLocation | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const state = String(m.manualState ?? "").trim();
  const district = String(m.manualDistrict ?? "").trim();
  const place = String(m.manualPlace ?? "").trim();
  const pincode = m.manualPincode != null ? String(m.manualPincode).trim() : null;
  if (!state && !district && !place && !pincode) return null;
  return {
    state: state || UNKNOWN_LOCATION.state,
    district: district || UNKNOWN_LOCATION.district,
    place: place || UNKNOWN_LOCATION.place,
    pincode: pincode || null,
  };
}

function locationFromTicket(ticket: {
  state: string | null;
  district: string | null;
  place: string | null;
  pincode: { code: string; state: string | null; district: string | null; place: string | null } | null;
}): WaLocation | null {
  const state = ticket.state?.trim() || ticket.pincode?.state?.trim() || "";
  const district = ticket.district?.trim() || ticket.pincode?.district?.trim() || "";
  const place = ticket.place?.trim() || ticket.pincode?.place?.trim() || "";
  const pincode = ticket.pincode?.code?.trim() || null;
  if (!state && !district && !place && !pincode) return null;
  return {
    state: state || UNKNOWN_LOCATION.state,
    district: district || UNKNOWN_LOCATION.district,
    place: place || UNKNOWN_LOCATION.place,
    pincode,
  };
}

function hasKnownLocation(loc: WaLocation): boolean {
  return (
    loc.state !== UNKNOWN_LOCATION.state ||
    loc.district !== UNKNOWN_LOCATION.district ||
    loc.place !== UNKNOWN_LOCATION.place ||
    !!loc.pincode
  );
}

function waLocationChartLabel(
  groupBy: "state" | "district" | "place",
  loc: WaLocation,
): string {
  if (groupBy === "district") {
    if (loc.district !== UNKNOWN_LOCATION.district) return `${loc.district}, ${loc.state}`;
    if (loc.state !== UNKNOWN_LOCATION.state) return `${loc.state} (district unknown)`;
    return "Unknown";
  }
  if (groupBy === "place") {
    if (loc.place !== UNKNOWN_LOCATION.place) return `${loc.place}, ${loc.district}`;
    if (loc.district !== UNKNOWN_LOCATION.district) return `${loc.district} (place unknown)`;
    return "Unknown";
  }
  return loc.state;
}

function parseQueryDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

type WaUserRow = {
  phoneNumber: string;
  lastActiveAt: Date;
  name: string | null;
  location: WaLocation;
};

function sortWaUsers(
  rows: WaUserRow[],
  sort: "lastActive" | "name" | "state",
  sortDir: "asc" | "desc",
): void {
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "name") {
      const an = (a.name ?? "").toLowerCase();
      const bn = (b.name ?? "").toLowerCase();
      return an.localeCompare(bn) * dir;
    }
    if (sort === "state") {
      const cmp = a.location.state.localeCompare(b.location.state);
      if (cmp !== 0) return cmp * dir;
      return a.location.district.localeCompare(b.location.district) * dir;
    }
    return (a.lastActiveAt.getTime() - b.lastActiveAt.getTime()) * dir;
  });
}

// ── GET /api/admin/analytics/whatsapp ────────────────────────────────────
// Distinct WhatsApp chatbot users (customer flow) with location breakdown.
export async function getWhatsappChatbotAnalytics(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const groupByRaw = String(req.query.groupBy ?? "state");
    const groupBy: "state" | "district" | "place" =
      groupByRaw === "district" ? "district" : groupByRaw === "place" ? "place" : "state";

    const since = parseQueryDate(req.query.since);
    let until = parseQueryDate(req.query.until);
    if (until) {
      until = new Date(until);
      until.setHours(23, 59, 59, 999);
    }

    const stateFilter = String(req.query.state ?? "").trim();
    const districtFilter = String(req.query.district ?? "").trim();
    const locationFilter = String(req.query.location ?? "all").trim().toLowerCase();
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const sortRaw = String(req.query.sort ?? "lastActive");
    const sort: "lastActive" | "name" | "state" =
      sortRaw === "name" ? "name" : sortRaw === "state" ? "state" : "lastActive";
    const sortDir: "asc" | "desc" = req.query.sortDir === "asc" ? "asc" : "desc";

    const [staffUsers, sessions, userMessageAgg, tickets] = await Promise.all([
      prisma.user.findMany({
        where: { whatsappNumber: { not: null } },
        select: { whatsappNumber: true, role: true },
      }),
      prisma.conversationSession.findMany({
        select: { phoneNumber: true, metadata: true, updatedAt: true },
      }),
      prisma.simulateMessage.groupBy({
        by: ["phoneNumber"],
        where: { role: "user" },
        _max: { createdAt: true },
      }),
      prisma.ticket.findMany({
        where: { phoneNumber: { not: null } },
        select: {
          phoneNumber: true,
          state: true,
          district: true,
          place: true,
          createdAt: true,
          pincode: { select: { code: true, state: true, district: true, place: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const staffKeys = new Set<string>();
    const staffRoles = new Set([
      "service_engineer",
      "dealer",
      "admin",
      "service_manager",
      "assistant_manager",
      "sales",
      "customer_support",
      "marketing",
      "hr",
    ]);
    for (const u of staffUsers) {
      if (!u.whatsappNumber || !staffRoles.has(u.role)) continue;
      staffKeys.add(waPhoneKey(u.whatsappNumber));
    }

    type UserRow = WaUserRow;

    const users = new Map<string, UserRow>();

    const ensureUser = (phone: string, lastActiveAt: Date) => {
      const key = waPhoneKey(phone);
      if (!key || staffKeys.has(key)) return null;
      const existing = users.get(key);
      if (!existing) {
        users.set(key, {
          phoneNumber: phone,
          lastActiveAt,
          name: null,
          location: { ...UNKNOWN_LOCATION },
        });
        return users.get(key)!;
      }
      if (lastActiveAt > existing.lastActiveAt) {
        existing.lastActiveAt = lastActiveAt;
        existing.phoneNumber = phone;
      }
      return existing;
    };

    for (const s of sessions) {
      const row = ensureUser(s.phoneNumber, s.updatedAt);
      if (!row) continue;
      const meta = s.metadata as Record<string, unknown> | null;
      const name = meta?.customerName != null ? String(meta.customerName).trim() : "";
      if (name) row.name = name;
    }

    for (const m of userMessageAgg) {
      ensureUser(m.phoneNumber, m._max.createdAt ?? new Date(0));
    }

    for (const t of tickets) {
      if (!t.phoneNumber) continue;
      const row = ensureUser(t.phoneNumber, t.createdAt);
      if (!row) continue;
      const loc = locationFromTicket(t);
      if (loc && !hasKnownLocation(row.location)) {
        row.location = loc;
      }
    }

    for (const s of sessions) {
      const key = waPhoneKey(s.phoneNumber);
      const row = users.get(key);
      if (!row || hasKnownLocation(row.location)) continue;
      const loc = locationFromSessionMetadata(s.metadata);
      if (loc) row.location = loc;
      const meta = s.metadata as Record<string, unknown> | null;
      const name = meta?.customerName != null ? String(meta.customerName).trim() : "";
      if (name && !row.name) row.name = name;
    }

    const userList = Array.from(users.values());

    const filterOptions = {
      states: [
        ...new Set(
          userList.map((u) => u.location.state).filter((s) => s && s !== UNKNOWN_LOCATION.state),
        ),
      ].sort((a, b) => a.localeCompare(b)),
      districts: [
        ...new Set(
          userList
            .map((u) =>
              u.location.district !== UNKNOWN_LOCATION.district
                ? `${u.location.district}|${u.location.state}`
                : null,
            )
            .filter((x): x is string => !!x),
        ),
      ]
        .map((key) => {
          const [district, state] = key.split("|");
          return { district, state, label: `${district}, ${state}` };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    };

    let filtered = userList;

    if (since) {
      filtered = filtered.filter((u) => u.lastActiveAt >= since);
    }
    if (until) {
      filtered = filtered.filter((u) => u.lastActiveAt <= until);
    }
    if (stateFilter) {
      const s = stateFilter.toLowerCase();
      filtered = filtered.filter((u) => u.location.state.toLowerCase() === s);
    }
    if (districtFilter) {
      const d = districtFilter.toLowerCase();
      filtered = filtered.filter((u) => u.location.district.toLowerCase() === d);
    }
    if (locationFilter === "known") {
      filtered = filtered.filter((u) => hasKnownLocation(u.location));
    } else if (locationFilter === "unknown") {
      filtered = filtered.filter((u) => !hasKnownLocation(u.location));
    }
    if (search) {
      const digits = search.replace(/\D/g, "");
      filtered = filtered.filter((u) => {
        if (u.name?.toLowerCase().includes(search)) return true;
        const phone = u.phoneNumber.toLowerCase();
        const phoneDigits = u.phoneNumber.replace(/\D/g, "");
        if (phone.includes(search)) return true;
        if (digits && phoneDigits.includes(digits)) return true;
        return false;
      });
    }

    sortWaUsers(filtered, sort, sortDir);

    const byLocationMap = new Map<string, number>();
    for (const u of filtered) {
      const label = waLocationChartLabel(groupBy, u.location);
      byLocationMap.set(label, (byLocationMap.get(label) ?? 0) + 1);
    }

    const byLocation = Array.from(byLocationMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const usersWithLocation = filtered.filter((u) => hasKnownLocation(u.location)).length;

    res.json({
      groupBy,
      sort,
      sortDir,
      totalUnfiltered: userList.length,
      totalUniqueUsers: filtered.length,
      usersWithLocation,
      usersWithoutLocation: filtered.length - usersWithLocation,
      byLocation,
      filterOptions,
      users: filtered.map((u) => ({
        phoneNumber: u.phoneNumber,
        name: u.name,
        state: u.location.state,
        district: u.location.district,
        place: u.location.place,
        pincode: u.location.pincode,
        lastActiveAt: u.lastActiveAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("getWhatsappChatbotAnalytics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

const WA_STAFF_ROLES = new Set([
  "service_engineer",
  "dealer",
  "admin",
  "service_manager",
  "assistant_manager",
  "sales",
  "customer_support",
  "marketing",
  "hr",
]);

async function loadWaStaffPhoneKeys(): Promise<Set<string>> {
  const staffUsers = await prisma.user.findMany({
    where: { whatsappNumber: { not: null } },
    select: { whatsappNumber: true, role: true },
  });
  const staffKeys = new Set<string>();
  for (const u of staffUsers) {
    if (!u.whatsappNumber || !WA_STAFF_ROLES.has(u.role)) continue;
    staffKeys.add(waPhoneKey(u.whatsappNumber));
  }
  return staffKeys;
}

// ── GET /api/admin/analytics/whatsapp/live ───────────────────────────────
// Customers active on WhatsApp in the last N minutes (default 15).
export async function getWhatsappLiveUsers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const minutesRaw = parseInt(String(req.query.minutes ?? "15"), 10);
    const windowMinutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(minutesRaw, 120) : 15;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const [staffKeys, recentActivity, tickets] = await Promise.all([
      loadWaStaffPhoneKeys(),
      // Message activity is the source of truth — session.updatedAt often stays stale
      // when the user chats without an FSM state transition.
      prisma.simulateMessage.groupBy({
        by: ["phoneNumber"],
        where: { createdAt: { gte: since } },
        _max: { createdAt: true },
      }),
      prisma.ticket.findMany({
        where: { phoneNumber: { not: null } },
        select: {
          phoneNumber: true,
          state: true,
          district: true,
          place: true,
          pincode: { select: { code: true, state: true, district: true, place: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const ticketLocByPhone = new Map<string, WaLocation>();
    for (const t of tickets) {
      if (!t.phoneNumber) continue;
      const key = waPhoneKey(t.phoneNumber);
      if (ticketLocByPhone.has(key)) continue;
      const loc = locationFromTicket(t);
      if (loc) ticketLocByPhone.set(key, loc);
    }

    const liveEntries = recentActivity
      .filter((row) => {
        const key = waPhoneKey(row.phoneNumber);
        return key && !staffKeys.has(key) && row._max.createdAt;
      })
      .map((row) => ({
        phoneNumber: row.phoneNumber,
        lastActiveAt: row._max.createdAt as Date,
      }))
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());

    const livePhones = liveEntries.map((e) => e.phoneNumber);

    const [sessions, lastMessages] = livePhones.length
      ? await Promise.all([
          prisma.conversationSession.findMany({
            where: { phoneNumber: { in: livePhones } },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.simulateMessage.findMany({
            where: { phoneNumber: { in: livePhones } },
            orderBy: { createdAt: "desc" },
            distinct: ["phoneNumber"],
            select: { phoneNumber: true, role: true, content: true, createdAt: true },
          }),
        ])
      : [[], []];

    const sessionByPhone = new Map<string, (typeof sessions)[0]>();
    for (const s of sessions) {
      const key = waPhoneKey(s.phoneNumber);
      if (!sessionByPhone.has(key)) sessionByPhone.set(key, s);
    }

    const lastMsgByPhone = new Map(
      lastMessages.map((m) => [waPhoneKey(m.phoneNumber), m]),
    );

    const liveUsers = liveEntries.map((entry) => {
      const key = waPhoneKey(entry.phoneNumber);
      const session = sessionByPhone.get(key);
      const meta = (session?.metadata ?? null) as Record<string, unknown> | null;
      const name = meta?.customerName != null ? String(meta.customerName).trim() : null;
      let location = ticketLocByPhone.get(key) ?? { ...UNKNOWN_LOCATION };
      if (!hasKnownLocation(location) && session) {
        const fromMeta = locationFromSessionMetadata(session.metadata);
        if (fromMeta) location = fromMeta;
      }
      const lastMsg = lastMsgByPhone.get(key);
      return {
        phoneNumber: entry.phoneNumber,
        name,
        state: location.state,
        district: location.district,
        place: location.place,
        pincode: location.pincode,
        sessionState: session?.state ?? "UNKNOWN",
        isBotPaused: session?.isBotPaused ?? false,
        lastActiveAt: entry.lastActiveAt.toISOString(),
        lastMessage: lastMsg
          ? {
              role: lastMsg.role,
              content: lastMsg.content.slice(0, 200),
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
      };
    });

    res.json({
      windowMinutes,
      liveCount: liveUsers.length,
      liveUsers,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getWhatsappLiveUsers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
