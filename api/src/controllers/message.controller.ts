import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { embedText, searchVectors } from "../services/vector.service";
import { translateText } from "../services/translate.service";
import { groqChat } from "../services/groq.service";
import { findVideosForQuery } from "./video.controller";
import axios from "axios";
import { runtime } from "../services/runtime-config.service";

// â”€â”€ RAG helper: build context + call Ollama generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function generateRAGResponse(userQuery: string, userRole: string, language?: string): Promise<string> {
  try {    // ── Pre-check: ensure admin has uploaded training documents ────────
    // Strict isolation: each role only sees documents uploaded for that role.
    // customer → only "customer" docs,  service → only "service" docs.
    // If no relevant docs exist in the DB, return early with a helpful message.
    const roleTypes = userRole === "customer"
      ? ["customer"]
      : userRole === "service"
        ? ["service"]
        : userRole === "new_user"
          ? ["new_user"]
          : undefined; // admin sees all

    if (roleTypes) {
      const docCount = await prisma.document.count({
        where: { documentType: { in: roleTypes } },
      });
      if (docCount === 0) {
        console.warn(`[RAG] No training documents found for role "${userRole}" — skipping RAG pipeline`);
        return "__NO_DOCS__ Our AI assistant is currently being configured. In the meantime, you can reach our customer service team by starting a new conversation — our team will assist you shortly.";
      }
    } else {
      // admin: check if any documents exist at all
      const docCount = await prisma.document.count();
      if (docCount === 0) {
        console.warn(`[RAG] No training documents found — skipping RAG pipeline`);
        return "No training documents have been uploaded yet. Please upload documents from the admin panel to enable AI-powered responses.";
      }
    }
    // 1. Embed the user query
    const t0 = Date.now();
    const queryEmbedding = await embedText(userQuery);
    console.log(`[RAG] embed: ${Date.now() - t0} ms`);

    // 2. Determine role filter for vector search (strict per-role isolation)
    let roleFilter: string[] | undefined;
    if (userRole === "customer") {
      roleFilter = ["customer"];
    } else if (userRole === "service") {
      roleFilter = ["service"];
    } else if (userRole === "new_user") {
      roleFilter = ["new_user"];
    }
    // admin: no filter (retrieve all)

    // 3. Search Qdrant for top-3 most relevant document chunks
    const t1 = Date.now();
    const hits = await searchVectors(queryEmbedding, 3, roleFilter);
    console.log(`[RAG] search: ${Date.now() - t1} ms`);

    // Filter out chunks below minimum similarity threshold (cosine score 0–1).
    // Anything below 0.40 is unlikely to be relevant — skip LLM entirely.
    const MIN_SCORE = 0.40;
    const relevantHits = hits.filter((h) => h.score >= MIN_SCORE);
    console.log(`[RAG] hits: ${hits.length} total, ${relevantHits.length} above threshold (${MIN_SCORE})`);

    if (relevantHits.length === 0) {
      console.warn(`[RAG] No documentation found above threshold for query: "${userQuery}"`);
      return "I couldn't find this information in the documentation.";
    }

    const isTranslation = Boolean(language && language !== "en");
    const DIRECT_SCORE = 0.60;
    const topHit = relevantHits[0];

    // ── Step 1: Get English answer (direct-hit or LLM) ──────────────────
    let englishAnswer: string;

    if (topHit.payload.directResponse === true && topHit.score >= DIRECT_SCORE) {
      console.log(`[RAG] direct-hit: "${topHit.payload.tag}" score=${topHit.score.toFixed(3)} — skipping LLM`);
      englishAnswer = (topHit.payload.content as string) || "I couldn't find this information in the documentation.";
    } else {
    // 4. Build context from relevant chunks
    const MAX_CHUNK_CHARS = 800;
    const context = relevantHits
      .map((h, i) => {
        const content = (h.payload.content as string).slice(0, MAX_CHUNK_CHARS);
        return `[${i + 1}] ${content}`;
      })
      .join("\n\n")
      .slice(0, 3000);
    console.log(`[RAG] chunks: ${relevantHits.length}, context size: ${context.length} chars`);

    // 5. Build prompt
    const roleInstruction = userRole === "customer"
      ? [
          "SYSTEM:",
          "You are PoornasreeAI, a product support assistant for Poornasree milk analyzer equipment.",
          "You MUST answer ONLY using the CONTEXT below. Do NOT use your own knowledge.",
          "If the answer is not in the CONTEXT, respond exactly: \"I couldn't find this information in the documentation.\"",
          "Copy the solutions from the CONTEXT. Do not invent new steps.",
          "Format each step as: Step 1 -- <instruction from context>",
        ].join("\n")
      : userRole === "new_user"
        ? [
            "SYSTEM:",
            "You are PoornasreeAI, a friendly onboarding guide for new users of Poornasree milk testing equipment.",
            "You MUST answer ONLY using the CONTEXT below. Do NOT use your own knowledge.",
            "If the answer is not in the CONTEXT, respond exactly: \"I couldn't find this information in the documentation.\"",
            "Be welcoming, simple, and encouraging. Use friendly language.",
            "Format steps clearly: Step 1 -- <instruction from context>",
          ].join("\n")
      : [
          "SYSTEM:",
          "You are PoornasreeAI, a technical support assistant for Poornasree milk analyzer equipment.",
          "You MUST answer ONLY using the CONTEXT below. Do NOT use your own knowledge.",
          "If the answer is not in the CONTEXT, respond exactly: \"I couldn't find this information in the documentation.\"",
          "Copy the troubleshooting steps from the CONTEXT. Do not invent new steps.",
          "Format each step as: Step 1 -- <instruction from context>",
        ].join("\n");

    const prompt = [roleInstruction, "", "CONTEXT:", context, "", `QUESTION:\n${userQuery}`, "", "ANSWER (use ONLY the context above):"].join("\n");

    const t2 = Date.now();
    const answer = await groqChat(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 400, timeoutMs: 20_000 }
    );
    console.log(`[RAG] Groq Llama 3.3 70B generate: ${Date.now() - t2} ms`);
    englishAnswer = answer || "Sorry, I wasn't able to generate a response.";
    }

    // Step 2: Translate if non-English (focused second LLM call)
    if (isTranslation) {
      return await translateText(englishAnswer, language || "en");
    }

    return englishAnswer;
  } catch (err: any) {
    console.error("[RAG] generation error:", err?.message ?? err);
    return "I'm having trouble connecting to the AI service right now. Please try again shortly.";
  }
}
export async function createMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { conversationId, content, language, productContext } = req.body;

    if (!conversationId || !content?.trim()) {
      res.status(400).json({ error: "conversationId and content are required" });
      return;
    }

    // Verify the conversation exists and belongs to this user
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (conversation.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Block new messages from customers when conversation is resolved
    if (conversation.status === "resolved") {
      res.status(403).json({ error: "This conversation has been resolved. Please start a new conversation." });
      return;
    }

    // Persist the user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: content.trim(),
      },
    });

    // â”€â”€ RAG-powered assistant reply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // productContext (e.g. "VIBRO Stirrer") is prepended to the search query to
    // improve vector search recall without changing what is stored in the DB.
    const searchQuery = productContext ? `${productContext} ${content.trim()}` : content.trim();
    const assistantContent = await generateRAGResponse(searchQuery, userRole, language);

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: assistantContent,
      },
    });

    // Bump conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // ── Video recommendations ──────────────────────────────────────────────
    // Show curated videos after a real troubleshooting answer (not on errors / no-docs).
    const isNoDocs = assistantContent.startsWith("__NO_DOCS__");
    const noAnswer = assistantContent.includes("couldn't find this information in the documentation");
    let videos: Awaited<ReturnType<typeof findVideosForQuery>> = [];
    if (!isNoDocs && !noAnswer) {
      videos = await findVideosForQuery(searchQuery, 3);
    }

    // Strip the internal marker before sending to client
    if (isNoDocs) {
      assistantMessage.content = assistantContent.replace("__NO_DOCS__ ", "");
      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: { content: assistantMessage.content },
      });
    }

    res.status(201).json({
      userMessage,
      assistantMessage,
      videos,
    });
  } catch (err) {
    console.error("createMessage error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// â”€â”€ POST /api/conversations/:id/reply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Allows a service / admin agent to manually post an assistant message
// into any conversation they have access to.
//
// Body: { content: string }
export async function addManualReply(req: Request, res: Response): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const id = req.params.id as string;
    const { content } = req.body;

    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    // Only service and admin may send manual replies
    const allowedRoles = ["service", "admin"];
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Resolved conversations are locked â€” no further replies allowed
    if (conversation.status === "resolved") {
      res.status(403).json({ error: "This conversation has been resolved and is now read-only" });
      return;
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        role: "assistant",
        content: content.trim(),
      },
    });

    // Auto-advance status: open â†’ in_progress on first manual reply
    const newStatus = conversation.status === "open" ? "in_progress" : conversation.status;

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date(), status: newStatus },
    });

    // suppress unused variable warning â€” userId kept for future audit logging
    void userId;

    res.status(201).json({ message });
  } catch (err) {
    console.error("addManualReply error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
