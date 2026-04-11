"use client";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { X, AlertTriangle } from "lucide-react";
import type { ServiceTicket } from "./types";
import { STATUS_BADGE, getPriorityFromAge, SLA_RESPONSE_HOURS } from "./utils";

interface DrawerHeaderProps {
  ticket: ServiceTicket;
  customerName?: string;
  onClose: () => void;
}

export function DrawerHeader({ ticket, customerName, onClose }: DrawerHeaderProps) {
  const cfg = STATUS_BADGE[ticket.status];
  const priority = getPriorityFromAge(ticket.ageHours);

  const city = ticket.pincode?.place || ticket.pincode?.district || null;
  // problemDescription = actual complaint; issueDescription = metadata
  const complaint = ticket.problemDescription || null;
  const issueTitle = complaint
    ? (complaint.length > 60 ? complaint.slice(0, 60) + "…" : complaint)
    : null;

  // SLA overdue indicator
  const isOverdue = ticket.status !== "CLOSED" && typeof ticket.ageHours === "number" && ticket.ageHours > SLA_RESPONSE_HOURS && !ticket.responseTimeHours;
  const overdueHours = typeof ticket.ageHours === "number" ? ticket.ageHours : 0;

  return (
    <div className="sticky top-0 z-10 bg-surface-card dark:bg-surface-dark-card border-b border-line dark:border-line-dark">
      {/* Row 1: Ticket # + Close */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {ticket.ticketNumber && (
            <span className="text-xs font-mono text-content-tertiary dark:text-content-dark-tertiary">
              #{ticket.ticketNumber}
            </span>
          )}
          {/* Priority badge */}
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wide",
            priority.color
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", priority.dotColor)} />
            {priority.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-content-tertiary dark:text-content-dark-tertiary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Row 2: Status + SLA indicator */}
      <div className="flex items-center gap-2 px-5 pb-2">
        <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
        {isOverdue && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {overdueHours}h NO RESPONSE
          </span>
        )}
        {ticket.status === "CLOSED" && ticket.durationHours != null && (
          <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
            Resolved in {ticket.durationHours}h
          </span>
        )}
      </div>

      {/* Row 3: Customer + Location + Issue */}
      <div className="px-5 pb-3 space-y-0.5">
        {customerName && (
          <p className="text-sm font-semibold text-content dark:text-content-dark leading-tight truncate">
            {customerName}
          </p>
        )}
        <div className="flex items-center gap-2">
          {city && (
            <span className="text-xs text-content-tertiary dark:text-content-dark-tertiary">
              📍 {city}
            </span>
          )}
        </div>
        {issueTitle && (
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary font-medium leading-snug">
            {issueTitle}
          </p>
        )}
      </div>
    </div>
  );
}
