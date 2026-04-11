"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Phone } from "lucide-react";
import type { ServiceTicket } from "./types";
import { parseTicketDescription } from "./utils";

interface DrawerCustomerInfoProps {
  ticket: ServiceTicket;
  resolvedName?: string;
}

export function DrawerCustomerInfo({ ticket, resolvedName }: DrawerCustomerInfoProps) {
  const [addressOpen, setAddressOpen] = useState(false);
  const issueMeta = parseTicketDescription(ticket.issueDescription || "");
  const descMeta = parseTicketDescription(ticket.problemDescription || "");

  const customerName = resolvedName || ticket.machineCustomer || issueMeta.customerName || descMeta.customerName || null;
  const phone = ticket.phoneNumber || issueMeta.phone || descMeta.phone;

  const hasAddress = ticket.machineAddress1 || ticket.machineAddress2 || ticket.pincode || issueMeta.location || descMeta.location;

  if (!customerName && !phone && !hasAddress) return null;

  return (
    <div className="px-5 py-4 border-t border-line dark:border-line-dark">
      <h4 className="text-[10px] font-semibold text-content-tertiary dark:text-content-dark-tertiary uppercase tracking-wider mb-2">
        Customer
      </h4>
      <div className="space-y-2">
        {/* Name */}
        {customerName && (
          <p className="text-sm font-medium text-content dark:text-content-dark">{customerName}</p>
        )}

        {/* Phone (click-to-call) */}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 text-xs text-primary dark:text-blue-400 hover:underline font-medium"
          >
            <Phone className="w-3 h-3" />
            {phone}
          </a>
        )}

        {/* Email */}
        {ticket.customer?.email && (
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{ticket.customer.email}</p>
        )}

        {/* Address (collapsed by default) */}
        {hasAddress && (
          <div>
            <button
              onClick={() => setAddressOpen(!addressOpen)}
              className="flex items-center gap-1 text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors"
            >
              {addressOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {addressOpen ? "Hide Address" : "Show Address"}
            </button>
            {addressOpen && (
              <div className="mt-1.5 text-xs text-content-secondary dark:text-content-dark-secondary space-y-0.5 pl-4 border-l-2 border-line dark:border-line-dark">
                {ticket.machineAddress1 && <p>{ticket.machineAddress1}</p>}
                {ticket.machineAddress2 && <p>{ticket.machineAddress2}</p>}
                {ticket.pincode && (
                  <p>{ticket.pincode.code} · {[ticket.pincode.place, ticket.pincode.district, ticket.pincode.state].filter(Boolean).join(", ")}</p>
                )}
                {!ticket.machineAddress1 && !ticket.machineAddress2 && !ticket.pincode && (issueMeta.location || descMeta.location) && (
                  <p>{issueMeta.location || descMeta.location}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Source */}
        {ticket.dealer && (
          <p className="text-[10px] text-content-tertiary dark:text-content-dark-tertiary">
            Via Dealer: {ticket.dealer.firstName} {ticket.dealer.lastName ?? ""}
          </p>
        )}
      </div>
    </div>
  );
}
