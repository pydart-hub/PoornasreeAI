import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { embedText, searchVectors } from "../services/vector.service";
import axios from "axios";

const OLLAMA_URL  = process.env.OLLAMA_URL || "http://localhost:11434";
const GEN_MODEL   = "phi3:mini";

// ── RAG helper: build context + call Ollama generate ──────────────────
async function generateRAGResponse(userQuery: string): Promise<string> {
  try {
    // 1. Embed the user query
    const queryEmbedding = await embedText(userQuery);

    // 2. Search Qdrant for top-5 most relevant document chunks
    const hits = await searchVectors(queryEmbedding, 5);

    if (hits.length === 0) {
      return "I couldn't find any relevant documents to answer your question. Please try rephrasing, or contact our service team for help.";
    }

    // 3. Build prompt with context
    const context = hits
      .map((h, i) => `[${i + 1}] ${h.payload.content}`)
      .join("\n\n");

    const prompt = [
      "You are PoornasreeAI, a technical support assistant for industrial equipment.",
      "Your ONLY source of knowledge is the documentation context provided below.",
      "You MUST follow these rules without exception:",
      "  1. Answer ONLY using information from the context. Do NOT add steps, advice, or knowledge that is not explicitly stated in the context.",
      "  2. Do NOT invent, assume, or guess any troubleshooting steps.",
      "  3. If the context does not contain a direct answer, respond with exactly: \"I couldn't find this information in the documentation.\"",
      "  4. Format troubleshooting steps as a numbered list using this exact style:",
      "     Step 1 — <check action> → <fix action>",
      "     Step 2 — <check action> → <fix action>",
      "     (and so on for each step)",
      "  5. Do not add introductory sentences, disclaimers, or closing remarks beyond what is in the context.",
      "",
      "--- Documentation Context ---",
      context,
      "--- End Documentation Context ---",
      "",
      `User question: ${userQuery}`,
      "",
      "Answer (using ONLY the context above):",
    ].join("\n");

    // 4. Call Ollama chat
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      { model: GEN_MODEL, messages: [{ role: "user", content: prompt }], stream: false },
      { timeout: 300_000 } // 5 min timeout for LLM
    );

    return (data.message?.content as string)?.trim() || "Sorry, I wasn't able to generate a response.";
  } catch (err: any) {
    console.error("[RAG] generation error:", err?.message ?? err);
    return "I'm having trouble connecting to the AI service right now. Please try again shortly.";
  }
}
export async function createMessage(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { conversationId, content } = req.body;

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

    // ── RAG-powered assistant reply ──────────────────────────────────
    const assistantContent = await generateRAGResponse(content.trim());

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

// ── POST /api/conversations/:id/reply ────────────────────────────────
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
    const allowedRoles = ["service", "admin", "r_and_d"];
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Resolved conversations are locked — no further replies allowed
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

    // Auto-advance status: open → in_progress on first manual reply
    const newStatus = conversation.status === "open" ? "in_progress" : conversation.status;

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date(), status: newStatus },
    });

    // suppress unused variable warning — userId kept for future audit logging
    void userId;

    res.status(201).json({ message });
  } catch (err) {
    console.error("addManualReply error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
