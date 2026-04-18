"use client";

import { UserCheck, UserX } from "lucide-react";
import type { ServiceTicket } from "./types";

interface DrawerActionBarProps {
  ticket: ServiceTicket;
  onReassign: () => void;
  onCancelAssignment: () => void;
  cancellingAssignment?: boolean;
}

export function DrawerActionBar({ ticket, onReassign, onCancelAssignment, cancellingAssignment }: DrawerActionBarProps) {
  const isClosed = ticket.status === "CLOSED";

  return (
    <div className="sticky top-[auto] z-[9] bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark px-5 py-2.5">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {/* Reassign / Assign Engineer */}
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
        {!isClosed && ticket.assignedEngineer && ticket.status === "ASSIGNED" && (
          <button
            onClick={onCancelAssignment}
            disabled={cancellingAssignment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/5 dark:hover:bg-red-500/10 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <UserX className="w-3.5 h-3.5" />
            {cancellingAssignment ? "Cancelling…" : "Cancel Assignment"}
          </button>
        )}
      </div>
    </div>
  );
}
