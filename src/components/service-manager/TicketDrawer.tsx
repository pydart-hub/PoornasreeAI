"use client";

import { useRef, useEffect, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { TicketDrawerProps } from "./types";
import { parseTicketDescription } from "./utils";
import { DrawerHeader } from "./DrawerHeader";
import { DrawerActionBar } from "./DrawerActionBar";
import { DrawerTimeline } from "./DrawerTimeline";
import { DrawerAssignment } from "./DrawerAssignment";
import { DrawerIssueDetails } from "./DrawerIssueDetails";
import { DrawerCustomerInfo } from "./DrawerCustomerInfo";
import { DrawerSLA } from "./DrawerSLA";
import { DrawerAttachments } from "./DrawerAttachments";
import { ReassignModal } from "./ReassignModal";

export function TicketDrawer({
  ticket,
  engineers,
  isArchived,
  assigningId,
  onClose,
  onAssignEngineer,
  onCancelAssignment,
  onArchive,
  onUnarchive,
}: TicketDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [cancellingAssignment, setCancellingAssignment] = useState(false);

  // issueDescription holds structured metadata ("Customer: X, Location: Y, ...")
  // problemDescription holds the actual complaint text
  const issueMeta = parseTicketDescription(ticket.issueDescription || "");
  const descMeta = parseTicketDescription(ticket.problemDescription || "");
  const customerName = ticket.machineCustomer || issueMeta.customerName || descMeta.customerName || undefined;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { if (showReassignModal) setShowReassignModal(false); else onClose(); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showReassignModal]);

  const handleAssign = async (ticketId: string, engineerId: string) => {
    await onAssignEngineer(ticketId, engineerId);
  };

  const handleCancelAssignment = async () => {
    setCancellingAssignment(true);
    try {
      await onCancelAssignment(ticket.id);
    } finally {
      setCancellingAssignment(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-surface-card dark:bg-surface-dark-card border-l border-line dark:border-line-dark shadow-xl flex flex-col animate-slide-in-right"
      >
        {/* ── 1. Sticky Header ── */}
        <DrawerHeader
          ticket={ticket}
          customerName={customerName}
          onClose={onClose}
        />

        {/* ── 2. Action Bar ── */}
        <DrawerActionBar
          ticket={ticket}
          onReassign={() => setShowReassignModal(true)}
          onCancelAssignment={handleCancelAssignment}
          cancellingAssignment={cancellingAssignment}
        />

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── 3. Timeline ── */}
          <DrawerTimeline ticket={ticket} />

          {/* ── 4. Assignment ── */}
          <DrawerAssignment
            ticket={ticket}
            engineers={engineers}
            assigningId={assigningId}
            onAssignEngineer={handleAssign}
          />

          {/* ── 5. Issue Details ── */}
          <DrawerIssueDetails ticket={ticket} />

          {/* ── 6. Customer Info ── */}
          <DrawerCustomerInfo ticket={ticket} resolvedName={customerName} />

          {/* ── 7. SLA / Performance ── */}
          <DrawerSLA ticket={ticket} />

          {/* ── 8. Attachments ── */}
          <DrawerAttachments ticket={ticket} />

          {/* ── Footer: Meta + Archive ── */}
          <div className="px-5 py-4 border-t border-line dark:border-line-dark space-y-3">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
              <span>Source: {ticket.dealer ? `Dealer — ${ticket.dealer.firstName}` : "Direct"}</span>
              <span>Created: {formatRelativeTime(new Date(ticket.createdAt))}</span>
              {ticket.updatedAt && <span>Updated: {formatRelativeTime(new Date(ticket.updatedAt))}</span>}
              {ticket.ageHours != null && <span>Age: {ticket.ageHours}h</span>}
            </div>

            {/* Archive / Unarchive */}
            <button
              onClick={() => {
                if (isArchived) onUnarchive(ticket.id);
                else onArchive(ticket.id);
                onClose();
              }}
              className="flex items-center gap-1.5 text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors"
            >
              {isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {isArchived ? "Unarchive Ticket" : "Archive Ticket"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Reassign Modal ── */}
      {showReassignModal && (
        <ReassignModal
          ticket={ticket}
          engineers={engineers}
          assigningId={assigningId}
          onAssignEngineer={handleAssign}
          onClose={() => setShowReassignModal(false)}
        />
      )}
    </>
  );
}
