export type TicketStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_OTP" | "CLOSED";

export interface PincodeInfo {
  id: string;
  code: string;
  place?: string | null;
  district?: string | null;
  state?: string | null;
}

export interface Engineer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  activeTickets?: number;
  engineerPincodes?: PincodeInfo[];
  hrEngineerId?: number | null;
  source?: "hr" | "local";
  pendingSetup?: boolean;
}

export interface ServiceTicket {
  id: string;
  ticketNumber?: string;
  ownerType?: "MANAGER" | "DEALER";
  ownerId?: string | null;
  status: TicketStatus;
  problemDescription: string;
  issueDescription?: string | null;
  machineName?: string | null;
  machineSerialNumber?: string | null;
  machineProductCode?: string | null;
  machineCustomer?: string | null;
  machineAddress1?: string | null;
  machineAddress2?: string | null;
  machineInvoiceNo?: string | null;
  machineInvoiceDate?: string | null;
  machineWarranty?: number | null;
  ageHours?: number;
  responseTimeHours?: number | null;
  durationHours?: number | null;
  createdAt: string;
  updatedAt?: string;
  firstEngineeredAt?: string | null;
  closedAt?: string | null;
  mediaUrls?: string[];
  customer?: { firstName: string; lastName?: string | null; email: string; role?: string } | null;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  assignedManager?: { firstName: string; lastName?: string | null } | null;
  dealer?: { id?: string; firstName: string; lastName?: string | null } | null;
  dealerId?: string | null;
  assignedDealer?: { id: string; firstName: string; lastName?: string | null } | null;
  passtestMatched?: boolean;
  dealerResponse?: string | null;
  dealerRespondedAt?: string | null;
  pincode?: PincodeInfo | null;
  phoneNumber?: string | null;
  customerAddress?: string | null;
  dealerNote?: string | null;
}

export interface Dealer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  whatsappNumber?: string | null;
  pincode?: PincodeInfo | null;
}

export interface TicketDrawerProps {
  ticket: ServiceTicket;
  engineers: Engineer[];
  dealers: Dealer[];
  assistants: any[];
  isArchived: boolean;
  assigningId: string | null;
  assigningDealerId: string | null;
  onClose: () => void;
  onAssignEngineer: (ticketId: string, engineerId: string) => Promise<void>;
  onAssignDealer: (ticketId: string, dealerId: string) => Promise<void>;
  onAssignAssistant?: (ticketId: string, assistantId: string) => Promise<void>;
  onCancelAssignment: (ticketId: string) => Promise<void>;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onWorkReportImageClick?: (url: string) => void;
}
