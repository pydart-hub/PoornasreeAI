import type { ServiceTicket } from "./types";

export type AssignmentMode = "none" | "engineer" | "matched-dealer";

/** SM actions for OPEN tickets awaiting assignment. */
export function getAssignmentMode(ticket: ServiceTicket): AssignmentMode {
  if (ticket.status !== "OPEN" || ticket.assignedEngineer || ticket.assignedDealer) {
    return "none";
  }
  if (ticket.dealerResponse === "rejected") {
    return "engineer";
  }
  if (ticket.passtestMatched && ticket.dealerId && ticket.dealer) {
    return "matched-dealer";
  }
  return "engineer";
}

export const DEALER_RESPONSE_LABELS: Record<string, string> = {
  pending: "Awaiting Accept",
  accepted: "Accepted",
  rejected: "Rejected",
  completed: "Completed",
};
