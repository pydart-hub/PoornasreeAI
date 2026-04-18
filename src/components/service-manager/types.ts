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
}

export interface ServiceTicket {
  id: string;
  ticketNumber?: string;
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
  customer?: { firstName: string; lastName?: string | null; email: string } | null;
  assignedEngineer?: { firstName: string; lastName?: string | null } | null;
  assignedManager?: { firstName: string; lastName?: string | null } | null;
  dealer?: { firstName: string; lastName?: string | null } | null;
  pincode?: PincodeInfo | null;
  phoneNumber?: string | null;
}

export interface TicketDrawerProps {
  ticket: ServiceTicket;
  engineers: Engineer[];
  isArchived: boolean;
  assigningId: string | null;
  onClose: () => void;
  onAssignEngineer: (ticketId: string, engineerId: string) => Promise<void>;
  onCancelAssignment: (ticketId: string) => Promise<void>;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}
