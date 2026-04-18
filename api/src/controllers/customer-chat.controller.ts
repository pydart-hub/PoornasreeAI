// ── Customer Chat Controller (Public — no auth) ──────────────────────────
// Endpoints for the menu-driven customer web chat.
// Mirrors the WhatsApp simulate flow but adapted for the web UI.

import { Request, Response } from "express";
import prisma from "../lib/prisma";
import * as TicketService from "../services/ticket.service";
import { fetchMachineBySerial } from "../services/machine.service";
import { io } from "../lib/socket";

// ── Phone Lookup ──────────────────────────────────────────────────────────
// POST /api/customer-chat/lookup   { phone: "9876543210" }
// Returns { found: boolean, name?: string }
export async function phoneLookup(req: Request, res: Response) {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) {
    res.status(400).json({ error: "Phone must be exactly 10 digits" });
    return;
  }

  const lookupVariants = [digits, `91${digits}`];

  // Check User table (whatsappNumber)
  const user = await prisma.user.findFirst({
    where: { whatsappNumber: { in: lookupVariants } },
    select: { firstName: true, lastName: true },
  });

  if (user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    res.json({ found: true, name });
    return;
  }

  // Check Ticket table (phoneNumber)
  const ticket = await prisma.ticket.findFirst({
    where: { phoneNumber: { in: lookupVariants } },
    orderBy: { createdAt: "desc" },
    select: { machineCustomer: true },
  });

  if (ticket) {
    res.json({ found: true, name: ticket.machineCustomer || "Customer" });
    return;
  }

  res.json({ found: false });
}

// ── Products List ─────────────────────────────────────────────────────────
// GET /api/customer-chat/products
export async function listProducts(_req: Request, res: Response) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, description: true },
  });

  if (products.length > 0) {
    res.json({ products });
    return;
  }

  // Fallback hardcoded list (same as simulate service)
  res.json({
    products: [
      { id: "1", name: "Milk Analyzer", description: null },
      { id: "2", name: "VIBRO Stirrer", description: null },
      { id: "3", name: "Water Pump", description: null },
      { id: "4", name: "Motor Controller", description: null },
      { id: "5", name: "Display Unit", description: null },
    ],
  });
}

// ── Ticket Status ─────────────────────────────────────────────────────────
// POST /api/customer-chat/ticket-status   { phone: "9876543210" }
export async function ticketStatus(req: Request, res: Response) {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "phone is required" });
    return;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) {
    res.status(400).json({ error: "Phone must be exactly 10 digits" });
    return;
  }

  const lookupPhones = [digits, `91${digits}`];

  const tickets = await prisma.ticket.findMany({
    where: { phoneNumber: { in: lookupPhones } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      ticketNumber: true,
      status: true,
      problemDescription: true,
      machineName: true,
      createdAt: true,
    },
  });

  res.json({ tickets });
}

// ── Validate Serial Number ────────────────────────────────────────────────
// POST /api/customer-chat/validate-serial   { serialNumber: "ABC123" }
export async function validateSerial(req: Request, res: Response) {
  const { serialNumber } = req.body;
  if (!serialNumber || typeof serialNumber !== "string") {
    res.status(400).json({ error: "serialNumber is required" });
    return;
  }

  const serial = serialNumber.replace(/\s+/g, "").toUpperCase();
  if (!serial) {
    res.status(400).json({ error: "Invalid serial number" });
    return;
  }

  try {
    const machineData = await fetchMachineBySerial(serial);
    if (machineData) {
      // Check admin-registered machine for display name
      let adminModelName: string | undefined;
      try {
        const adminMachine = await prisma.machine.findUnique({ where: { serialNumber: serial } });
        if (adminMachine?.modelName) adminModelName = adminMachine.modelName;
      } catch { /* non-blocking */ }

      res.json({
        found: true,
        machine: {
          customer: machineData.customer || null,
          model: adminModelName || machineData.m_model || null,
          location: [machineData.Address1, machineData.Address2].filter(Boolean).join(", ") || null,
        },
      });
      return;
    }
  } catch {
    // API error — treat as not found
  }

  res.json({ found: false });
}

// ── Validate Pincode ──────────────────────────────────────────────────────
// POST /api/customer-chat/validate-pincode   { pincode: "682024" }
export async function validatePincode(req: Request, res: Response) {
  const { pincode } = req.body;
  if (!pincode || typeof pincode !== "string" || !/^\d{6}$/.test(pincode)) {
    res.status(400).json({ error: "Pincode must be exactly 6 digits" });
    return;
  }

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();
    if (
      Array.isArray(data) &&
      data[0]?.Status === "Success" &&
      Array.isArray(data[0]?.PostOffice) &&
      data[0].PostOffice.length > 0
    ) {
      const po = data[0].PostOffice[0];
      res.json({
        valid: true,
        place: po.Name || null,
        district: po.District || null,
        state: po.State || null,
      });
      return;
    }
  } catch {
    // API error — treat as invalid
  }

  res.json({ valid: false });
}

// ── Submit Complaint ──────────────────────────────────────────────────────
// POST /api/customer-chat/complaint
export async function submitComplaint(req: Request, res: Response) {
  const { name, phone, pincode, serialNumber, product, issue } = req.body;

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Name must be at least 2 characters" });
    return;
  }
  if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length !== 10) {
    res.status(400).json({ error: "Phone must be exactly 10 digits" });
    return;
  }
  if (!pincode || typeof pincode !== "string" || !/^\d{6}$/.test(pincode)) {
    res.status(400).json({ error: "Pincode must be exactly 6 digits" });
    return;
  }
  if (!product || typeof product !== "string" || !product.trim()) {
    res.status(400).json({ error: "Product is required" });
    return;
  }
  if (!issue || typeof issue !== "string" || issue.trim().length < 3) {
    res.status(400).json({ error: "Issue description must be at least 3 characters" });
    return;
  }

  const phoneDigits = phone.replace(/\D/g, "");

  // Resolve pincode record (create if not exists)
  let pincodeId: string | undefined;
  let place: string | undefined;
  let district: string | undefined;
  let stateName: string | undefined;

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();
    if (
      Array.isArray(data) &&
      data[0]?.Status === "Success" &&
      Array.isArray(data[0]?.PostOffice) &&
      data[0].PostOffice.length > 0
    ) {
      const po = data[0].PostOffice[0];
      place = po.Name || undefined;
      district = po.District || undefined;
      stateName = po.State || undefined;
    }
  } catch { /* non-blocking */ }

  let pincodeRecord = await prisma.pincode.findFirst({ where: { code: pincode } });
  if (!pincodeRecord) {
    pincodeRecord = await prisma.pincode.create({
      data: { code: pincode, place: place || null, district: district || null, state: stateName || null },
    });
  }
  pincodeId = pincodeRecord.id;

  // Use admin user as customerId (same pattern as WhatsApp simulate flow)
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!adminUser) {
    res.status(503).json({ error: "Service temporarily unavailable" });
    return;
  }

  // Check for dealer match by customer name (same logic as simulate.service.ts)
  let resolvedDealerId: string | undefined;
  const customerNameLower = name.trim().toLowerCase();
  const dealers = await prisma.user.findMany({
    where: { role: "dealer" },
    select: { id: true, firstName: true, lastName: true },
  });
  const matchedDealer = dealers.find((d) => {
    const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ").toLowerCase();
    return fullName === customerNameLower || d.firstName.toLowerCase() === customerNameLower;
  });
  if (matchedDealer) {
    resolvedDealerId = matchedDealer.id;
  }

  const complaintText = issue.trim();
  const productName = product.trim();
  const serial = serialNumber?.replace(/\s+/g, "").toUpperCase() || undefined;

  const ticket = await TicketService.createTicket({
    customerId: adminUser.id,
    problemDescription: `${productName}: ${complaintText}`,
    issueDescription: `Customer: ${name.trim()}, Phone: ${phoneDigits}, Pincode: ${pincode}${place ? ` (${[place, district, stateName].filter(Boolean).join(", ")})` : ""}`,
    machineName: productName,
    machineSerialNumber: serial,
    pincodeId,
    phoneNumber: phoneDigits,
    dealerId: resolvedDealerId,
    place,
    district,
    state: stateName,
  });

  // Notify managers/dealer
  if (ticket.ownerType === "DEALER" && ticket.ownerId) {
    io?.to(`dealer:${ticket.ownerId}`).emit("ticket:new", ticket);
  } else {
    io?.to("managers").emit("ticket:new", ticket);
  }

  res.json({
    success: true,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
  });
}
