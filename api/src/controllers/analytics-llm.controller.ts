import { Request, Response } from "express";
import prisma from "../lib/prisma";

/**
 * GET /api/admin/analytics/groq-usage
 * (Also exposed via /api/public/groq-usage for quick inspection)
 * Returns comprehensive token usage statistics, model breakdowns, and recent activity.
 */
export async function getGroqUsageStats(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

    // 1. All-time aggregate
    const allTimeAgg = await prisma.llmUsageLog.aggregate({
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: {
        id: true,
      },
    });

    // 2. Today's aggregate
    const todayAgg = await prisma.llmUsageLog.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: {
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
      },
      _count: {
        id: true,
      },
    });

    // 3. This week's aggregate
    const weekAgg = await prisma.llmUsageLog.aggregate({
      where: { createdAt: { gte: startOfWeek } },
      _sum: {
        totalTokens: true,
      },
      _count: {
        id: true,
      },
    });

    // 4. Breakdown by Model
    const modelGroups = await prisma.llmUsageLog.groupBy({
      by: ["model", "provider"],
      _sum: {
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          totalTokens: "desc",
        },
      },
    });

    // 5. Breakdown by Feature (e.g. whatsapp_bot, engineer_qa, whisper_stt)
    const featureGroups = await prisma.llmUsageLog.groupBy({
      by: ["feature"],
      _sum: {
        totalTokens: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          totalTokens: "desc",
        },
      },
    });

    // 6. Recent 50 requests
    const recentLogs = await prisma.llmUsageLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      summary: {
        totalTokensAllTime: allTimeAgg._sum.totalTokens || 0,
        totalPromptTokens: allTimeAgg._sum.promptTokens || 0,
        totalCompletionTokens: allTimeAgg._sum.completionTokens || 0,
        totalRequests: allTimeAgg._count.id || 0,
        tokensToday: todayAgg._sum.totalTokens || 0,
        requestsToday: todayAgg._count.id || 0,
        tokensThisWeek: weekAgg._sum.totalTokens || 0,
        requestsThisWeek: weekAgg._count.id || 0,
      },
      models: modelGroups.map((m) => ({
        model: m.model,
        provider: m.provider,
        requests: m._count.id,
        totalTokens: m._sum.totalTokens || 0,
        promptTokens: m._sum.promptTokens || 0,
        completionTokens: m._sum.completionTokens || 0,
      })),
      features: featureGroups.map((f) => ({
        feature: f.feature,
        requests: f._count.id,
        totalTokens: f._sum.totalTokens || 0,
      })),
      recentRequests: recentLogs,
    });
  } catch (error) {
    console.error("[analytics-llm] getGroqUsageStats error:", error);
    res.status(500).json({ error: "Failed to fetch LLM usage statistics" });
  }
}

/**
 * GET /api/admin/whatsapp/messages
 * (Also available for monitoring outbound and inbound WhatsApp messages)
 */
export async function getWhatsAppMessages(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
    const skip = (page - 1) * limit;

    const phone = req.query.phone ? String(req.query.phone).trim() : undefined;
    const role = req.query.role ? String(req.query.role).trim() : undefined;

    const where: any = {};
    if (phone) {
      where.phoneNumber = { contains: phone };
    }
    if (role) {
      where.role = role;
    }

    const [total, messages] = await Promise.all([
      prisma.simulateMessage.count({ where }),
      prisma.simulateMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      messages,
    });
  } catch (error) {
    console.error("[analytics-llm] getWhatsAppMessages error:", error);
    res.status(500).json({ error: "Failed to fetch WhatsApp messages" });
  }
}
