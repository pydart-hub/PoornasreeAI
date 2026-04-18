"use client";

import { Phone, UserCheck, UserX, AlertOctagon, XCircle, PhoneCall } from "lucide-react";
import type { ServiceTicket } from "./types";

interface DrawerActionBarProps {
  ticket: ServiceTicket;
  onReassign: () => void;
  onCancelAssignment: () => void;
  cancellingAssignment?: boolean;
}

export function DrawerActionBar({ ticket, onReassign, onCancelAssignment, cancellingAssignment }: DrawerActionBarProps) {
  const phone = ticket.phoneNumber;
  const isClosed = ticket.status === "CLOSED";

  return (
    <div className="sticky top-[auto] z-[9] bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-5 py-2.5">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {/* Call Customer */}
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors whitespace-nowrap"
          >
            <Phone className="w-3.5 h-3.5" />
            Call Customer
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark text-content-tertiary dark:text-content-dark-tertiary opacity-50 cursor-not-allowed whitespace-nowrap">
            <Phone className="w-3.5 h-3.5" />
            No Phone
          </span>
        )}

        {/* Call Engineer */}
        <button
          disabled
          title="Engineer phone not available"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark text-content-tertiary dark:text-content-dark-tertiary opacity-50 cursor-not-allowed whitespace-nowrap"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          Call Engineer
        </button>

        {/* Reassign / Assign Engineer — opens popup */}
        {!isClosed && (
          <button
            onClick={onReassign}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary dark:text-blue-400 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors whitespace-nowrap"
          >
            <UserCheck className="w-3.5 h-3.5" />
            {ticket.assignedEngineer ? "Reassign" : "Assign"}
          </button>
        )}

        {/* Cancel Assignment */}
        {!isClosed && ticket.assignedEngineer && (
          <button
            onClick={onCancelAssignment}
            disabled={cancellingAssignment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/5 dark:hover:bg-red-500/10 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <UserX className="w-3.5 h-3.5" />
            {cancellingAssignment ? "Cancelling\u2026" : "Cancel Assignment"}
          </button>
        )}

        {/* Escalate */}
        {!isClosed && (
          <button
            disabled
            title="Escalation not available yet"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark text-content-tertiary dark:text-content-dark-tertiary opacity-50 cursor-not-allowed whitespace-nowrap"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            Escalate
          </button>
        )}

        {/* Close Ticket */}
        {!isClosed && (
          <button
            disabled
            title="Close requires OTP verification by engineer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-line dark:border-line-dark text-content-tertiary dark:text-content-dark-tertiary opacity-50 cursor-not-allowed whitespace-nowrap"
          >
            <XCircle className="w-3.5 h-3.5" />
            Close
          </button>
        )}
      </div>
    </div>
  );
}
