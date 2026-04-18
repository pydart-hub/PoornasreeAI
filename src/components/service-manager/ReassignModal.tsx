"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, UserCheck, MapPin, Loader2 } from "lucide-react";
import type { ServiceTicket, Engineer } from "./types";

interface ReassignModalProps {
  ticket: ServiceTicket;
  engineers: Engineer[];
  assigningId: string | null;
  onAssignEngineer: (ticketId: string, engineerId: string) => Promise<void>;
  onClose: () => void;
}

export function ReassignModal({ ticket, engineers, assigningId, onAssignEngineer, onClose }: ReassignModalProps) {
  const [confirmEng, setConfirmEng] = useState<Engineer | null>(null);

  const ticketPincode = ticket.pincode;
  const matched = ticketPincode
    ? engineers.filter(e => e.engineerPincodes?.some(p => p.id === ticketPincode.id || p.code === ticketPincode.code))
    : engineers;

  const currentEngineer = ticket.assignedEngineer;

  const handleConfirm = async () => {
    if (!confirmEng) return;
    await onAssignEngineer(ticket.id, confirmEng.id);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-surface-card dark:bg-surface-dark-card rounded-2xl shadow-2xl w-full max-w-sm border border-line dark:border-line-dark pointer-events-auto animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-line-dark">
            <div>
              <h3 className="text-sm font-bold text-content dark:text-content-dark">
                {currentEngineer ? "Reassign Engineer" : "Assign Engineer"}
              </h3>
              {ticketPincode && (
                <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary mt-0.5">
                  Zone: {ticketPincode.code}
                  {ticketPincode.place && ` — ${ticketPincode.place}`}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current engineer info */}
          {currentEngineer && !confirmEng && (
            <div className="px-5 py-3 bg-surface-secondary/50 dark:bg-surface-dark-secondary/50 border-b border-line dark:border-line-dark">
              <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-1">Currently Assigned</p>
              <p className="text-xs font-medium text-content dark:text-content-dark">
                {currentEngineer.firstName} {currentEngineer.lastName ?? ""}
              </p>
            </div>
          )}

          {/* Confirmation view */}
          {confirmEng ? (
            <div className="p-5 space-y-3">
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {currentEngineer ? "Reassign" : "Assign"} to {confirmEng.firstName} {confirmEng.lastName ?? ""}?
                </p>
                {currentEngineer && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    Replacing: {currentEngineer.firstName} {currentEngineer.lastName ?? ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={assigningId === ticket.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {assigningId === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmEng(null)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-content-secondary dark:text-content-dark-secondary border border-line dark:border-line-dark hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            /* Engineer list */
            <div className="p-4">
              {matched.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 text-center">
                  No engineers assigned to zone {ticketPincode?.code ?? "—"}
                </p>
              ) : (
                <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {matched.map(eng => (
                    <button
                      key={eng.id}
                      onClick={() => setConfirmEng(eng)}
                      className="w-full text-left px-3 py-2.5 text-xs text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-between gap-2 border-b border-line dark:border-line-dark last:border-b-0"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">{eng.firstName} {eng.lastName}</span>
                      </span>
                      {eng.activeTickets !== undefined && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                          eng.activeTickets === 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : eng.activeTickets <= 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                              : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                        )}>{eng.activeTickets}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
