// ── Troubleshooting Service ───────────────────────────────────────────────
// Deterministic step-based engine. No AI — pure string matching.
// Session flow: start → respond (YES/NO/HELP) → complete or escalate.

import prisma from "../lib/prisma";
import * as TicketService from "./ticket.service";

// ── Helpers ───────────────────────────────────────────────────────────────

function err(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

const SESSION_INCLUDE = {
  // No FK relation — we look up template separately
} as const;

function formatStep(stepNumber: number, totalSteps: number, content: string): string {
  return `Step ${stepNumber} of ${totalSteps}: ${content}\nIs the issue resolved? Reply YES or NO.`;
}

// ── startSession ─────────────────────────────────────────────────────────
// Resumes an existing ACTIVE session or creates a new one.
export async function startSession(phoneNumber: string, serialNumber: string, problemType: string) {
  // Check for existing active session
  const existing = await prisma.troubleshootingSession.findFirst({
    where: { phoneNumber, serialNumber, status: "ACTIVE" },
  });

  if (existing) {
    // Resume — return current step
    const step = await getStepContent(existing.problemType, existing.currentStep);
    const totalSteps = await getStepCount(existing.problemType);
    return {
      session: existing,
      message: `Resuming session.\n${formatStep(existing.currentStep, totalSteps, step)}`,
      resumed: true,
    };
  }

  // Validate template exists and is active
  const template = await prisma.documentIssue.findUnique({
    where: { problemType },
    include: { steps: { orderBy: { stepNumber: "asc" as const } } },
  });

  if (!template || !template.isActive) {
    err(`No active troubleshooting template found for problem type: ${problemType}`, 404);
  }

  if (template.steps.length === 0) {
    err(`Template "${problemType}" has no steps defined`, 400);
  }

  // Create new session
  const session = await prisma.troubleshootingSession.create({
    data: {
      phoneNumber,
      serialNumber,
      problemType,
      currentStep: 1,
      status: "ACTIVE",
    },
  });

  const firstStep = template.steps[0];
  return {
    session,
    message: formatStep(1, template.steps.length, firstStep.stepContent),
    resumed: false,
  };
}

// ── getCurrentStep ───────────────────────────────────────────────────────
export async function getCurrentStep(sessionId: string) {
  const session = await prisma.troubleshootingSession.findUnique({ where: { id: sessionId } });
  if (!session) err("Session not found", 404);

  if (session.status !== "ACTIVE") {
    return { session, message: `Session is ${session.status}. No further steps.`, done: true };
  }

  const stepContent = await getStepContent(session.problemType, session.currentStep);
  const totalSteps = await getStepCount(session.problemType);

  return {
    session,
    message: formatStep(session.currentStep, totalSteps, stepContent),
    done: false,
  };
}

// ── handleResponse ───────────────────────────────────────────────────────
// Interprets user input and delegates to the appropriate action.
export async function handleResponse(sessionId: string, response: string) {
  const session = await prisma.troubleshootingSession.findUnique({ where: { id: sessionId } });
  if (!session) err("Session not found", 404);
  if (session.status !== "ACTIVE") err("Session is no longer active", 400);

  const normalized = response.trim().toUpperCase();

  if (normalized === "YES" || normalized === "Y") {
    return completeSession(sessionId);
  }

  if (normalized === "NO" || normalized === "N") {
    return moveToNextStep(sessionId);
  }

  if (normalized === "HELP" || normalized === "ESCALATE") {
    return escalateSession(sessionId);
  }

  // Unrecognised input
  const totalSteps = await getStepCount(session.problemType);
  const stepContent = await getStepContent(session.problemType, session.currentStep);
  return {
    session,
    message: `I didn't understand "${response}". Please reply YES, NO, or HELP.\n\n${formatStep(session.currentStep, totalSteps, stepContent)}`,
    done: false,
  };
}

// ── completeSession ──────────────────────────────────────────────────────
export async function completeSession(sessionId: string) {
  const session = await prisma.troubleshootingSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED" },
  });

  return {
    session,
    message: "Great! The issue is resolved. Session completed.",
    done: true,
  };
}

// ── moveToNextStep ───────────────────────────────────────────────────────
export async function moveToNextStep(sessionId: string) {
  const session = await prisma.troubleshootingSession.findUnique({ where: { id: sessionId } });
  if (!session) err("Session not found", 404);

  const totalSteps = await getStepCount(session.problemType);
  const nextStep = session.currentStep + 1;

  if (nextStep > totalSteps) {
    // All steps exhausted → escalate
    return escalateSession(sessionId);
  }

  const updated = await prisma.troubleshootingSession.update({
    where: { id: sessionId },
    data: { currentStep: nextStep },
  });

  const stepContent = await getStepContent(session.problemType, nextStep);

  return {
    session: updated,
    message: formatStep(nextStep, totalSteps, stepContent),
    done: false,
  };
}

// ── escalateSession ──────────────────────────────────────────────────────
// Marks session as ESCALATED and creates a Ticket for human follow-up.
export async function escalateSession(sessionId: string) {
  const session = await prisma.troubleshootingSession.findUnique({ where: { id: sessionId } });
  if (!session) err("Session not found", 404);

  // Find or create a system user to own the ticket (use admin as fallback)
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) err("No admin user found — cannot create escalation ticket", 500);

  const ticket = await TicketService.createTicket({
    customerId: admin.id,
    problemDescription: [
      `[Auto-escalated from troubleshooting]`,
      `Phone: ${session.phoneNumber}`,
      `Serial: ${session.serialNumber}`,
      `Problem type: ${session.problemType}`,
      `Reached step ${session.currentStep} before escalation`,
      `Session ID: ${session.id}`,
    ].join("\n"),
    machineName: session.serialNumber,
  });

  await prisma.troubleshootingSession.update({
    where: { id: sessionId },
    data: { status: "ESCALATED" },
  });

  return {
    session: { ...session, status: "ESCALATED" },
    message: `All troubleshooting steps attempted. A support ticket (${ticket.ticketNumber}) has been created. Our team will contact you shortly.`,
    done: true,
    ticketNumber: ticket.ticketNumber,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────

async function getStepContent(problemType: string, stepNumber: number): Promise<string> {
  const template = await prisma.documentIssue.findUnique({
    where: { problemType },
    include: { steps: { where: { stepNumber }, take: 1 } },
  });
  if (!template || template.steps.length === 0) {
    err(`Step ${stepNumber} not found for problem type "${problemType}"`, 404);
  }
  return template.steps[0].stepContent;
}

async function getStepCount(problemType: string): Promise<number> {
  const template = await prisma.documentIssue.findUnique({
    where: { problemType },
    include: { _count: { select: { steps: true } } },
  });
  return template?._count.steps ?? 0;
}
