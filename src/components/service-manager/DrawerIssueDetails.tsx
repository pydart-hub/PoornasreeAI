"use client";

import type { ServiceTicket } from "./types";

interface DrawerIssueDetailsProps {
  ticket: ServiceTicket;
}

export function DrawerIssueDetails({ ticket }: DrawerIssueDetailsProps) {
  const hasIssueData = ticket.problemDescription || ticket.machineName || ticket.machineSerialNumber;
  if (!hasIssueData) return null;

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
        Issue Details
      </h4>
      <div className="space-y-2">
        {/* Issue type (derived from product code) */}
        {ticket.machineProductCode && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-content-tertiary dark:text-content-dark-tertiary uppercase w-16 shrink-0">Type</span>
            <span className="text-xs text-content dark:text-content-dark">{ticket.machineProductCode}</span>
          </div>
        )}

        {/* Complaint (from problemDescription — the actual customer issue) */}
        {ticket.problemDescription && (
          <div>
            <span className="text-[10px] font-medium text-content-tertiary dark:text-content-dark-tertiary uppercase block mb-0.5">Complaint</span>
            <p className="text-xs text-content-secondary dark:text-content-dark-secondary leading-relaxed whitespace-pre-wrap">
              {ticket.problemDescription}
            </p>
          </div>
        )}

        {/* Machine info */}
        {(ticket.machineName || ticket.machineSerialNumber) && (
          <div className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-lg p-2.5">
            <div className="flex items-center gap-3 text-xs">
              {ticket.machineName && (
                <div className="min-w-0">
                  <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary block">Machine</span>
                  <span className="text-content dark:text-content-dark font-medium truncate block">{ticket.machineName}</span>
                </div>
              )}
              {ticket.machineSerialNumber && (
                <div className="min-w-0">
                  <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary block">Serial No.</span>
                  <span className="text-content dark:text-content-dark font-mono text-[11px] truncate block">{ticket.machineSerialNumber}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Closure reason / note */}
        {ticket.dealerNote && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5">
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase block mb-0.5">
              Closure Note / Reason
            </span>
            <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed whitespace-pre-wrap font-medium">
              {ticket.dealerNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
