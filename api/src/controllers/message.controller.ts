import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { embedText, searchVectors } from "../services/vector.service";
import axios from "axios";

const OLLAMA_URL  = process.env.OLLAMA_URL || "http://localhost:11434";
const GEN_MODEL   = "phi3:mini";

// â”€â”€ RAG helper: build context + call Ollama generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function generateRAGResponse(userQuery: string, userRole: string, language?: string): Promise<string> {
  try {
    // 1. Embed the user query
    const t0 = Date.now();
    const queryEmbedding = await embedText(userQuery);
    console.log(`[RAG] embed: ${Date.now() - t0} ms`);

    // 2. Determine role filter for vector search
    let roleFilter: string[] | undefined;
    if (userRole === "customer") {
      roleFilter = ["customer"];
    } else if (userRole === "service") {
      roleFilter = ["service", "customer"];
    }
    // admin: no filter (retrieve all)

    // 3. Search Qdrant for top-1 most relevant document chunk (topK=1 for speed)
    const t1 = Date.now();
    const hits = await searchVectors(queryEmbedding, 1, roleFilter);
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

    // ── Direct-response short-circuit (training.json intents) ──────────
    // If the best hit is a pre-indexed training intent with score ≥ 0.60,
    // return its stored response immediately — NO LLM call.
    // This gives ChatGPT-like response speed for all known product issues.
    const DIRECT_SCORE = 0.60;
    const topHit = relevantHits[0];
    if (topHit.payload.directResponse === true && topHit.score >= DIRECT_SCORE) {
      console.log(`[RAG] direct-hit: "${topHit.payload.tag}" score=${topHit.score.toFixed(3)} — skipping LLM`);
      return (topHit.payload.content as string) || "I couldn't find this information in the documentation.";
    }

    // 4. Build context — cap chunk at 600 chars (~150 tokens) and total at 1200 chars
    // This keeps the full prompt under 512 tokens so num_ctx:512 fits without truncation.
    const MAX_CHUNK_CHARS = 600;
    const context = relevantHits
      .map((h, i) => {
        const content = (h.payload.content as string).slice(0, MAX_CHUNK_CHARS);
        return `[${i + 1}] ${content}`;
      })
      .join("\n\n")
      .slice(0, 1200);
    console.log(`[RAG] chunks: ${relevantHits.length}, context size: ${context.length} chars`);

    // 5. Build prompt
    const roleInstruction = userRole === "customer"
      ? [
          "SYSTEM:",
          "You are PoornasreeAI, a product support assistant for Poornasree milk analyzer equipment.",
          "Answer ONLY using the documentation context below. Use clear, simple language.",
          "If the answer is not in the context, respond exactly: \"I couldn't find this information in the documentation.\"",
          "Provide up to 5 steps. Format: Step 1 -- <instruction>",
        ].join("\n")
      : [
          "SYSTEM:",
          "You are PoornasreeAI, a technical support assistant for Poornasree milk analyzer equipment.",
          "Answer ONLY using the documentation context below. Use precise technical language.",
          "If the answer is not in the context, respond exactly: \"I couldn't find this information in the documentation.\"",
          "Provide up to 5 troubleshooting steps. Format: Step 1 -- <instruction>",
        ].join("\n");

    const languageInstruction = language && language !== "en"
      ? `\nIMPORTANT: Respond entirely in ${language === "ml" ? "Malayalam" : language === "hi" ? "Hindi" : language}.`
      : "";

    const prompt = [
      roleInstruction,
      languageInstruction,
      "",
      "CONTEXT:",
      context,
      "",
      `QUESTION:\n${userQuery}`,
      "",
      "ANSWER:",
    ].join("\n");

    // 4. Call Ollama chat â€” keep_alive prevents model unloading between requests
    const t2 = Date.now();
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: GEN_MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        keep_alive: "10m",
        options: { num_ctx: 512, num_predict: 80, temperature: 0 },
      },
      { timeout: 300_000 }
    );
    console.log(`[RAG] generate: ${Date.now() - t2} ms`);

    return (data.message?.content as string)?.trim() || "Sorry, I wasn't able to generate a response.";
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

    res.status(201).json({
      userMessage,
      assistantMessage,
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
