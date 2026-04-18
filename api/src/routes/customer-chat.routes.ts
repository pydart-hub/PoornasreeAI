// ── Customer Chat Routes (Public — no auth required) ──────────────────────
import { Router } from "express";
import {
  phoneLookup,
  listProducts,
  ticketStatus,
  validateSerial,
  validatePincode,
  submitComplaint,
} from "../controllers/customer-chat.controller";

const router = Router();

// Simple in-memory rate limiter for phone lookup (prevent enumeration)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15;

function rateLimit(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    next();
    return;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  next();
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

router.post("/lookup", rateLimit, phoneLookup);
router.get("/products", listProducts);
router.post("/ticket-status", rateLimit, ticketStatus);
router.post("/validate-serial", validateSerial);
router.post("/validate-pincode", validatePincode);
router.post("/complaint", rateLimit, submitComplaint);

export default router;
