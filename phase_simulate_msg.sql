-- Migration: Add SimulateMessage table + phoneNumber column on Ticket
-- Date: 2026-03-19

-- 1. SimulateMessage table for persisting test-chat history
CREATE TABLE IF NOT EXISTS "SimulateMessage" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
    "phoneNumber" TEXT NOT NULL,
    "role"        TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulateMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SimulateMessage_phoneNumber_createdAt_idx"
    ON "SimulateMessage"("phoneNumber", "createdAt");

-- 2. Add phoneNumber column to Ticket (nullable — only set for simulate-originated tickets)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
