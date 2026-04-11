"use client";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Circle, Clock, UserCheck, Wrench, KeyRound } from "lucide-react";
import type { ServiceTicket } from "./types";

interface TimelineEvent {
  label: string;
  time: Date | null;
  icon: React.ReactNode;
  active: boolean;
  warning?: string;
}

interface DrawerTimelineProps {
  ticket: ServiceTicket;
}

export function DrawerTimeline({ ticket }: DrawerTimelineProps) {
  const events: TimelineEvent[] = [];

  const createdAt = new Date(ticket.createdAt);

  // 1. Ticket Created
  events.push({
    label: "Ticket Created",
    time: createdAt,
    icon: <Circle className="w-3.5 h-3.5" />,
    active: true,
  });

  // 2. Assigned to Engineer
  if (ticket.assignedEngineer && ticket.status !== "OPEN") {
    const assignedTime = ticket.firstEngineeredAt
      ? new Date(ticket.firstEngineeredAt)
      : ticket.updatedAt ? new Date(ticket.updatedAt) : null;

    const delayHours = assignedTime
      ? (assignedTime.getTime() - createdAt.getTime()) / 3600000
      : typeof ticket.ageHours === "number" ? ticket.ageHours : 0;

    events.push({
      label: `Assigned to ${ticket.assignedEngineer.firstName} ${ticket.assignedEngineer.lastName ?? ""}`.trim(),
      time: assignedTime,
      icon: <UserCheck className="w-3.5 h-3.5" />,
      active: true,
      warning: delayHours > 24 ? `${Math.round(delayHours)}h delay in assignment` : undefined,
    });
  }

  // 3. Work Started
  if (ticket.firstEngineeredAt) {
    events.push({
      label: "Work Started",
      time: new Date(ticket.firstEngineeredAt),
      icon: <Wrench className="w-3.5 h-3.5" />,
      active: true,
    });
  }

  // 4. Pending OTP
  if (ticket.status === "PENDING_OTP" || ticket.status === "CLOSED") {
    events.push({
      label: "OTP Verification Requested",
      time: ticket.closedAt ? new Date(ticket.closedAt) : null,
      icon: <KeyRound className="w-3.5 h-3.5" />,
      active: true,
    });
  }

  // 5. Closed
  if (ticket.closedAt) {
    events.push({
      label: "Ticket Closed",
      time: new Date(ticket.closedAt),
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      active: true,
    });
  }

  // Check for inactivity warning on open tickets
  const lastEventTime = events[events.length - 1]?.time;
  const now = new Date();
  const hoursSinceLastEvent = lastEventTime
    ? (now.getTime() - lastEventTime.getTime()) / 3600000
    : 0;

  const showInactivityWarning = ticket.status !== "CLOSED" && hoursSinceLastEvent > 48;

  return (
    <div className="px-5 py-4">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-3">
        Timeline
      </h4>
      <div className="relative">
        {events.map((event, index) => (
          <div key={index} className="flex gap-3 relative">
            {/* Vertical line */}
            {index < events.length - 1 && (
              <div className="absolute left-[9px] top-5 w-px h-[calc(100%-4px)] bg-line dark:bg-line-dark" />
            )}

            {/* Icon dot */}
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              event.active
                ? "text-primary dark:text-blue-400 bg-primary/10 dark:bg-blue-500/15"
                : "text-content-tertiary dark:text-content-dark-tertiary bg-surface-tertiary dark:bg-surface-dark-tertiary"
            )}>
              {event.icon}
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0">
              <p className="text-xs font-medium text-content dark:text-content-dark leading-tight">
                {event.label}
              </p>
              {event.time && (
                <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">
                  {formatRelativeTime(event.time)} · {event.time.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {event.warning && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" />
                  {event.warning}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Inactivity warning */}
        {showInactivityWarning && (
          <div className="flex gap-3 relative">
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-red-500 bg-red-50 dark:bg-red-500/15">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="pb-2">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                No update for {Math.round(hoursSinceLastEvent / 24)} days
              </p>
              <p className="text-[10px] text-red-500/70 dark:text-red-400/60 mt-0.5">
                Last activity: {lastEventTime ? formatRelativeTime(lastEventTime) : "Unknown"}
              </p>
            </div>
          </div>
        )}

        {/* Pending steps for open tickets */}
        {ticket.status !== "CLOSED" && !ticket.closedAt && (
          <div className="flex gap-3 relative opacity-40">
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border border-dashed border-content-tertiary dark:border-content-dark-tertiary">
              <Clock className="w-3 h-3 text-content-tertiary dark:text-content-dark-tertiary" />
            </div>
            <div className="pb-2">
              <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary italic">
                {ticket.status === "OPEN" ? "Awaiting assignment…" :
                 ticket.status === "ASSIGNED" ? "Awaiting engineer to start…" :
                 ticket.status === "IN_PROGRESS" ? "Awaiting OTP verification…" :
                 ticket.status === "PENDING_OTP" ? "Awaiting customer OTP…" : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
