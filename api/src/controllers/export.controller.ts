// ── Export Controller ─────────────────────────────────────────────────────
// Streams CSV exports for admin download.
// GET /api/admin/export/chats     → conversations log
// GET /api/admin/export/support   → support requests log

import { Request, Response } from "express";
import prisma from "../lib/prisma";

function escapeCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Wrap in quotes if it contains commas, newlines, or double-quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toRow(cells: unknown[]): string {
  return cells.map(escapeCell).join(",");
}

// ── GET /api/admin/export/chats ──────────────────────────────────────────
export async function exportChats(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const conversations = await prisma.conversation.findMany({
      include: {
        user: { select: { email: true, firstName: true, lastName: true, role: true } },
        messages: { select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="chats_export.csv"');

    // Header row
    res.write(
      toRow(["Conversation ID", "User Email", "User Name", "User Role", "Message #",
             "Speaker", "Message", "Timestamp", "Conversation Date"]) + "\n"
    );

    for (const conv of conversations) {
      const user = (conv as typeof conv & { user: { email: string; firstName: string; lastName: string | null; role: string } | null }).user;
      const userEmail = user?.email ?? "";
      const userName  = user ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "";
      const userRole  = user?.role ?? "";
      const convDate  = conv.createdAt.toISOString();

      type MsgType = { role: string; content: string; createdAt: Date };
      const messages = (conv as typeof conv & { messages: MsgType[] }).messages;

      if (messages.length === 0) {
        res.write(
          toRow([conv.id, userEmail, userName, userRole, 0, "", "", "", convDate]) + "\n"
        );
      } else {
        messages.forEach((msg, idx) => {
          res.write(
            toRow([
              conv.id, userEmail, userName, userRole,
              idx + 1, msg.role, msg.content,
              msg.createdAt.toISOString(), convDate,
            ]) + "\n"
          );
        });
      }
    }

    res.end();
  } catch (err) {
    console.error("exportChats:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/export/support ────────────────────────────────────────
export async function exportSupport(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const requests = await prisma.supportRequest.findMany({
      include: {
        customer: { select: { email: true, firstName: true, lastName: true } },
        engineer: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="support_export.csv"');

    res.write(
      toRow([
        "Request ID", "Customer Email", "Customer Name",
        "Engineer Email", "Engineer Name",
        "Problem Description", "Machine Name",
        "Status", "Created At", "Updated At",
      ]) + "\n"
    );

    type ReqType = typeof requests[number] & {
      customer: { email: string; firstName: string; lastName: string | null } | null;
      engineer: { email: string; firstName: string; lastName: string | null } | null;
    };

    for (const r of requests as ReqType[]) {
      res.write(
        toRow([
          r.id,
          r.customer?.email ?? "",
          r.customer ? `${r.customer.firstName} ${r.customer.lastName ?? ""}`.trim() : "",
          r.engineer?.email ?? "",
          r.engineer ? `${r.engineer.firstName} ${r.engineer.lastName ?? ""}`.trim() : "",
          r.problem ?? "",
          r.machineName ?? "",
          r.status,
          r.createdAt.toISOString(),
          r.updatedAt.toISOString(),
        ]) + "\n"
      );
    }

    res.end();
  } catch (err) {
    console.error("exportSupport:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET /api/admin/export/tickets ────────────────────────────────────────
export async function exportTickets(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const { ticketNumber, pincodeCode } = req.query;

    const where: Record<string, unknown> = {};
    if (ticketNumber) where.ticketNumber = { contains: String(ticketNumber) };
    if (pincodeCode) {
      const pincode = await prisma.pincode.findUnique({ where: { code: String(pincodeCode) } });
      if (pincode) where.pincodeId = pincode.id;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        customer: { select: { email: true, firstName: true, lastName: true } },
        dealer: { select: { email: true, firstName: true } },
        assignedEngineer: { select: { email: true, firstName: true } },
        assignedManager: { select: { email: true, firstName: true } },
        pincode: { select: { code: true, place: true, district: true, state: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="tickets_export.csv"');

    res.write(
      toRow([
        "Ticket Number", "Status", "Problem Description", "Machine Name",
        "Machine Serial", "Customer Email", "Customer Name",
        "Dealer Email", "Engineer", "Manager",
        "Pincode", "Region", "Created At", "Closed At",
      ]) + "\n"
    );

    for (const t of tickets) {
      res.write(
        toRow([
          t.ticketNumber, t.status, t.problemDescription, t.machineName ?? "",
          t.machineSerialNumber ?? "",
          t.customer?.email ?? "",
          t.customer ? `${t.customer.firstName} ${t.customer.lastName ?? ""}`.trim() : "",
          t.dealer?.email ?? "",
          t.assignedEngineer?.firstName ?? "",
          t.assignedManager?.firstName ?? "",
          t.pincode?.code ?? "",
          [t.pincode?.place, t.pincode?.district, t.pincode?.state].filter(Boolean).join(", "),
          t.createdAt.toISOString(),
          t.closedAt?.toISOString() ?? "",
        ]) + "\n"
      );
    }

    res.end();
  } catch (err) {
    console.error("exportTickets:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
}
