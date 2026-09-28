import type { ServiceTicket } from "./types";
import { calculateWarrantyStatus } from "@/lib/warranty";
import { Shield } from "lucide-react";

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

        {/* Machine & Warranty info */}
        {(ticket.machineName || ticket.machineSerialNumber || ticket.machineWarranty) && (() => {
          const warranty = calculateWarrantyStatus(ticket.machineWarranty, ticket.machineInvoiceDate);
          return (
            <div className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
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
                {warranty.hasWarranty && (
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary block">Warranty Status</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${warranty.badgeClass}`}>
                      <Shield className="w-2.5 h-2.5" />
                      {warranty.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Invoice details from Passtest */}
              {(ticket.machineInvoiceNo || ticket.machineInvoiceDate) && (
                <div className="flex items-center gap-4 pt-1.5 border-t border-line/60 dark:border-line-dark/60 text-[11px] text-content-tertiary">
                  {ticket.machineInvoiceNo && (
                    <span>Invoice: <strong className="font-mono text-content-secondary dark:text-content-dark-secondary">{ticket.machineInvoiceNo}</strong></span>
                  )}
                  {ticket.machineInvoiceDate && (
                    <span>Inv. Date: <strong className="font-mono text-content-secondary dark:text-content-dark-secondary">{ticket.machineInvoiceDate}</strong></span>
                  )}
                  {ticket.machineWarranty && (
                    <span>Period: <strong className="text-content-secondary dark:text-content-dark-secondary">{ticket.machineWarranty} Months</strong></span>
                  )}
                </div>
              )}
            </div>
          );
        })()}
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
