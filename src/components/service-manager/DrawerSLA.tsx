"use client";

import { cn } from "@/lib/utils";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ServiceTicket } from "./types";
import { SLA_RESPONSE_HOURS, SLA_RESOLUTION_HOURS, getSLAStatus } from "./utils";

interface DrawerSLAProps {
  ticket: ServiceTicket;
}

export function DrawerSLA({ ticket }: DrawerSLAProps) {
  const responseStatus = getSLAStatus(ticket.responseTimeHours, SLA_RESPONSE_HOURS);
  // For open tickets, compute live resolution time from age
  const liveResolutionHours = ticket.status !== "CLOSED" && typeof ticket.ageHours === "number"
    ? ticket.ageHours
    : ticket.durationHours;
  const liveResolutionStatus = getSLAStatus(liveResolutionHours, SLA_RESOLUTION_HOURS);

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-3">
        SLA Performance
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {/* Response Time */}
        <div className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" />
            <span className="text-[10px] font-medium text-content-tertiary dark:text-content-dark-tertiary uppercase">Response</span>
          </div>
          <p className="text-lg font-bold text-content dark:text-content-dark leading-none">
            {ticket.responseTimeHours != null ? `${ticket.responseTimeHours}h` : "—"}
          </p>
          <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">
            Target: {SLA_RESPONSE_HOURS}h
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {responseStatus.breached ? (
              <AlertTriangle className="w-3 h-3 text-red-500" />
            ) : ticket.responseTimeHours != null ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : null}
            <span className={cn("text-[10px] font-semibold", responseStatus.color)}>
              {responseStatus.label}
            </span>
          </div>
        </div>

        {/* Resolution Time */}
        <div className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" />
            <span className="text-[10px] font-medium text-content-tertiary dark:text-content-dark-tertiary uppercase">Resolution</span>
          </div>
          <p className="text-lg font-bold text-content dark:text-content-dark leading-none">
            {ticket.status === "CLOSED" && ticket.durationHours != null
              ? `${ticket.durationHours}h`
              : typeof ticket.ageHours === "number"
                ? `${ticket.ageHours}h`
                : "—"}
          </p>
          <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">
            Target: {SLA_RESOLUTION_HOURS}h
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {liveResolutionStatus.breached ? (
              <AlertTriangle className="w-3 h-3 text-red-500" />
            ) : liveResolutionHours != null ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : null}
            <span className={cn("text-[10px] font-semibold", liveResolutionStatus.color)}>
              {liveResolutionStatus.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
