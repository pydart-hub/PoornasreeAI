"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, UserCheck, MapPin, Loader2, ChevronDown } from "lucide-react";
import type { ServiceTicket, Engineer, Dealer } from "./types";

interface DrawerAssignmentProps {
  ticket: ServiceTicket;
  engineers: Engineer[];
  dealers: Dealer[];
  assigningId: string | null;
  assigningDealerId: string | null;
  onAssignEngineer: (ticketId: string, engineerId: string) => Promise<void>;
  onAssignDealer: (ticketId: string, dealerId: string) => Promise<void>;
}

export function DrawerAssignment({ ticket, engineers, dealers, assigningId, assigningDealerId, onAssignEngineer, onAssignDealer }: DrawerAssignmentProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmEng, setConfirmEng] = useState<Engineer | null>(null);
  const [dealerOpen, setDealerOpen] = useState(false);
  const [confirmDealer, setConfirmDealer] = useState<Dealer | null>(null);

  const isClosed = ticket.status === "CLOSED";
  const engineer = ticket.assignedEngineer;

  // Check inactivity (using updatedAt as proxy for last activity)
  const lastActivity = ticket.updatedAt ? new Date(ticket.updatedAt) : null;
  const hoursSinceUpdate = lastActivity ? (Date.now() - lastActivity.getTime()) / 3600000 : 0;
  const isInactive = !isClosed && hoursSinceUpdate > 48;

  // Filter engineers by ticket pincode — show ONLY zone-matched engineers
  const ticketPincode = ticket.pincode;
  const matched = ticketPincode
    ? engineers.filter(e => e.engineerPincodes?.some(p => p.id === ticketPincode.id || p.code === ticketPincode.code))
    : []; // no pincode on ticket → show no engineers

  const handleConfirm = async () => {
    if (!confirmEng) return;
    await onAssignEngineer(ticket.id, confirmEng.id);
    setConfirmEng(null);
    setReassignOpen(false);
  };

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
        Assignment
      </h4>

      {engineer ? (
        <div className="space-y-2">
          {/* Engineer info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                <UserCheck className="w-3.5 h-3.5 text-primary dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                  {engineer.firstName} {engineer.lastName ?? ""}
                </p>
                {lastActivity && (
                  <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
                    Last update: {formatRelativeTime(lastActivity)}
                  </p>
                )}
              </div>
            </div>

            {/* Inactivity warning */}
            {isInactive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Inactive
              </span>
            )}
          </div>

          {/* Reassign button */}
          {!isClosed && !reassignOpen && (
            <button
              onClick={() => setReassignOpen(true)}
              className="flex items-center gap-1 text-xs text-primary dark:text-blue-400 hover:text-primary-hover font-medium transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              Change Engineer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            ⚠ No engineer assigned
          </p>
          {!isClosed && !reassignOpen && (
            <button
              onClick={() => setReassignOpen(true)}
              className="flex items-center gap-1 text-xs text-primary dark:text-blue-400 hover:text-primary-hover font-medium transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Assign Engineer
            </button>
          )}
        </div>
      )}

      {/* Engineer selection panel */}
      {reassignOpen && !confirmEng && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">
              Select Engineer
              {ticketPincode && (
                <span className="ml-1 font-normal text-content-tertiary dark:text-content-dark-tertiary">
                  (Zone: {ticketPincode.code})
                </span>
              )}
            </p>
            <button onClick={() => setReassignOpen(false)} className="text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary">
              Cancel
            </button>
          </div>
          {matched.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-2 text-center">
              {ticketPincode
                ? `No engineer covers zone ${ticketPincode.code} — assign a pincode to an engineer in the Team tab first`
                : "No zone on ticket — set a pincode on the ticket before assigning an engineer"}
            </p>
          ) : (
            <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {matched.map(eng => (
                <button key={eng.id} onClick={() => setConfirmEng(eng)}
                  className="w-full text-left px-3 py-2 text-xs text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors flex items-center justify-between gap-2 border-b border-line dark:border-line-dark last:border-b-0">
                  <span className="flex items-center gap-1 min-w-0">
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

      {/* Confirmation panel */}
      {confirmEng && (
        <div className="mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {engineer ? "Reassign" : "Assign"} to {confirmEng.firstName} {confirmEng.lastName ?? ""}?
          </p>
          {engineer && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Currently: {engineer.firstName} {engineer.lastName ?? ""}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={assigningId === ticket.id}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {assigningId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
              Confirm
            </button>
            <button onClick={() => setConfirmEng(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Assign to Dealer section ── */}
      {!isClosed && (
        <div className="mt-4 pt-3 border-t border-line dark:border-line-dark">
          <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
            Dealer Assignment
          </h4>

          {/* Suggested Dealer from serial number match */}
          {ticket.dealerId && ticket.dealer && !dealerOpen && !confirmDealer && (
            <div className="mb-3 p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1.5">
                Suggested (from serial no.)
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-content dark:text-content-dark font-medium">
                  {ticket.dealer.firstName} {ticket.dealer.lastName ?? ""}
                </span>
                <button
                  onClick={() => onAssignDealer(ticket.id, ticket.dealerId!)}
                  disabled={assigningDealerId === ticket.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {assigningDealerId === ticket.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Assign to {ticket.dealer.firstName}
                </button>
              </div>
            </div>
          )}

          {/* Show currently assigned dealer */}
          {ticket.assignedDealer && !dealerOpen && !confirmDealer && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                  <UserCheck className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content dark:text-content-dark truncate">
                    {ticket.assignedDealer.firstName} {ticket.assignedDealer.lastName ?? ""}
                  </p>
                  <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">Assigned for field handling</p>
                </div>
              </div>
            </div>
          )}

          {!dealerOpen && !confirmDealer && (
            <button
              onClick={() => setDealerOpen(true)}
              className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {ticket.assignedDealer ? "Reassign Dealer" : "Assign to Dealer"}
            </button>
          )}

          {dealerOpen && !confirmDealer && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-content-secondary dark:text-content-dark-secondary">Select Dealer</p>
                <button onClick={() => setDealerOpen(false)} className="text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary">Cancel</button>
              </div>
              {dealers.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-2 text-center">
                  No dealers available
                </p>
              ) : (
                <div className="border border-line dark:border-line-dark rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {dealers.map(d => (
                    <button key={d.id} onClick={() => { setConfirmDealer(d); setDealerOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-content dark:text-content-dark hover:bg-surface-hover dark:hover:bg-surface-dark-hover transition-colors border-b border-line dark:border-line-dark last:border-b-0">
                      {d.firstName} {d.lastName ?? ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {confirmDealer && (
            <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                Assign to {confirmDealer.firstName} {confirmDealer.lastName ?? ""}?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { await onAssignDealer(ticket.id, confirmDealer.id); setConfirmDealer(null); }}
                  disabled={assigningDealerId === ticket.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {assigningDealerId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                  Confirm
                </button>
                <button onClick={() => setConfirmDealer(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-content-secondary dark:text-content-dark-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
