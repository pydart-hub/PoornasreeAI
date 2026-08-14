// ── Integration webhook ─────────────────────────────────────────────────────
// POSTs normalized ticket payloads to INTEGRATION_WEBHOOK_URL when configured.

import axios from "axios";
import { TicketStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { runtime } from "./runtime-config.service";
import {
  PUBLIC_TICKET_SELECT,
  STAGE_BY_STATUS,
  toStageExportDto,
  type StageExportDto,
  type StageSlug,
} from "../lib/ticket-export.mapper";

import { io } from "../lib/socket";

export type IntegrationEvent =
  | "ticket.created"
  | "ticket.assigned"
  | "ticket.unassigned"
  | "ticket.started"
  | "ticket.otp_requested"
  | "ticket.closed";

const EVENT_STAGE: Partial<Record<IntegrationEvent, StageSlug>> = {
  "ticket.created": "created",
  "ticket.assigned": "assigned",
  "ticket.unassigned": "created",
  "ticket.started": "in-progress",
  "ticket.otp_requested": "pending-otp",
  "ticket.closed": "closed",
};

/** Fire-and-forget webhook; never throws to callers. */
export function notifyTicketEvent(event: IntegrationEvent, ticketId: string): void {
  // Real-time broadcast to all connected dashboards & mobile apps
  try {
    if (io) {
      io.emit("ticket:updated", { ticketId, event });
      io.emit("ticket:new", { ticketId, event });
      if (event === "ticket.closed") {
        io.emit("ticket:closed", { ticketId, event });
      }
    }
  } catch (err) {
    console.error("[socket broadcast] error:", err);
  }

  if (!runtime.integrationWebhookUrl()) return;

  void (async () => {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: PUBLIC_TICKET_SELECT,
      });
      if (!ticket) return;

      const stage = EVENT_STAGE[event] ?? STAGE_BY_STATUS[ticket.status];
      const data = toStageExportDto(ticket, stage);
      await postWebhook(event, data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[integration-webhook] ${event} ticket=${ticketId}: ${msg}`);
    }
  })();
}

/** Notify with a ticket row already loaded (same select shape). */
export function notifyTicketEventWithTicket(
  event: IntegrationEvent,
  ticket: Parameters<typeof toStageExportDto>[0],
  stageOverride?: StageSlug,
): void {
  // Real-time broadcast to all connected dashboards & mobile apps
  try {
    if (io) {
      io.emit("ticket:updated", { ticketId: ticket.id, event });
      io.emit("ticket:new", { ticketId: ticket.id, event });
      if (event === "ticket.closed") {
        io.emit("ticket:closed", { ticketId: ticket.id, event });
      }
    }
  } catch (err) {
    console.error("[socket broadcast] error:", err);
  }

  if (!runtime.integrationWebhookUrl()) return;

  const stage = stageOverride ?? EVENT_STAGE[event] ?? STAGE_BY_STATUS[ticket.status as TicketStatus];
  const data = toStageExportDto(ticket, stage);
  void postWebhook(event, data).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[integration-webhook] ${event}: ${msg}`);
  });
}

async function postWebhook(event: IntegrationEvent, data: StageExportDto): Promise<void> {
  await axios.post(
    runtime.integrationWebhookUrl(),
    {
      event,
      stage: data.stage,
      status: data.status,
      data,
      sentAt: new Date().toISOString(),
    },
    {
      timeout: 10_000,
      headers: { "Content-Type": "application/json" },
    },
  );
}
