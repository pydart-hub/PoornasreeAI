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
  const hasSerial = !!ticket.machineSerialNumber?.trim();
  const hasMatchedDealer = !!(ticket.dealerId && ticket.dealer);
  if (hasMatchedDealer && (ticket.passtestMatched || hasSerial)) {
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
