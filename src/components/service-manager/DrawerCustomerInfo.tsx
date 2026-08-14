"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Compass, ExternalLink, Phone } from "lucide-react";
import type { ServiceTicket } from "./types";
import { parseTicketDescription, resolveTicketCustomerName } from "./utils";

interface DrawerCustomerInfoProps {
  ticket: ServiceTicket;
  resolvedName?: string;
}

export function DrawerCustomerInfo({ ticket, resolvedName }: DrawerCustomerInfoProps) {
  const [addressOpen, setAddressOpen] = useState(true);
  const issueMeta = parseTicketDescription(ticket.issueDescription || "");
  const descMeta = parseTicketDescription(ticket.problemDescription || "");

  const customerName = resolvedName || resolveTicketCustomerName(ticket);
  const phone = ticket.phoneNumber || issueMeta.phone || descMeta.phone;

  // Only show the registered account email when the customer relation IS the actual customer
  const isAdminProxy = !!(customerName && ticket.customer?.role === "admin");
  const customerEmail = isAdminProxy ? null : (ticket.customer?.email ?? null);

  const chatAddress = issueMeta.address || descMeta.address;
  const hasAddress =
    ticket.customerAddress ||
    chatAddress ||
    ticket.machineAddress1 ||
    ticket.machineAddress2 ||
    ticket.pincode ||
    issueMeta.location ||
    descMeta.location;

  // Extract map URL from any available field
  const fullTextToSearch = [
    ticket.customerAddress,
    ticket.issueDescription,
    ticket.problemDescription,
  ].filter(Boolean).join(" ");

  const gmapMatch = fullTextToSearch.match(
    /(https?:\/\/[^\s]+maps[^\s]+|https?:\/\/maps\.google[^\s]+|https?:\/\/goo\.gl[^\s]+|https?:\/\/maps\.app\.goo\.gl[^\s]+)/i
  );
  const gmapUrl = gmapMatch ? gmapMatch[0] : null;

  const searchQuery = [
    ticket.customerAddress?.replace(/\| Map: https?:\/\/[^\s]+/i, ""),
    ticket.machineAddress1,
    ticket.pincode?.place,
    ticket.pincode?.district,
    ticket.pincode?.state,
    ticket.pincode?.code,
    "India",
  ]
    .filter(Boolean)
    .join(", ");

  const targetUrl =
    gmapUrl ||
    (searchQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`
      : null);

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
            className="inline-flex items-center gap-1.5 text-xs text-primary dark:text-blue-400 hover:underline font-medium block"
          >
            <Phone className="w-3 h-3" />
            {phone}
          </a>
        )}

        {/* Email */}
        {customerEmail && (
          <p className="text-xs text-content-secondary dark:text-content-dark-secondary">{customerEmail}</p>
        )}

        {/* Prominent Always-Visible Map Location Badge */}
        {targetUrl && (
          <div className="pt-0.5 pb-1">
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors shadow-xs"
            >
              <Compass className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
              <span>🗺️ Google Maps Location</span>
              <ExternalLink className="w-3 h-3 opacity-70 flex-shrink-0 ml-0.5" />
            </a>
          </div>
        )}

        {/* Address Details */}
        {hasAddress && (
          <div>
            <button
              onClick={() => setAddressOpen(!addressOpen)}
              className="flex items-center gap-1 text-xs text-content-tertiary dark:text-content-dark-tertiary hover:text-content-secondary dark:hover:text-content-dark-secondary transition-colors"
            >
              {addressOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {addressOpen ? "Hide Location Details" : "Show Location Details"}
            </button>
            {addressOpen && (
              <div className="mt-1.5 text-xs text-content-secondary dark:text-content-dark-secondary space-y-1 pl-4 border-l-2 border-line dark:border-line-dark">
                {(ticket.customerAddress || chatAddress) && (
                  <p className="font-medium text-content dark:text-content-dark">
                    📍 {ticket.customerAddress || chatAddress}
                  </p>
                )}
                {ticket.machineAddress1 && <p>{ticket.machineAddress1}</p>}
                {ticket.machineAddress2 && <p>{ticket.machineAddress2}</p>}
                {ticket.pincode && (
                  <p>
                    {ticket.pincode.code} ·{" "}
                    {[ticket.pincode.place, ticket.pincode.district, ticket.pincode.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {!ticket.machineAddress1 &&
                  !ticket.machineAddress2 &&
                  !ticket.pincode &&
                  (issueMeta.location || descMeta.location) && (
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
