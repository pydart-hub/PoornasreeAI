-- Ticket dealer workflow fields
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "passtestMatched" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "dealerResponse" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "dealerRespondedAt" TIMESTAMP(3);

-- Backfill passtestMatched for existing rows with Passtest enrichment
UPDATE "Ticket"
SET "passtestMatched" = true
WHERE "machineSerialNumber" IS NOT NULL
  AND ("machineCustomer" IS NOT NULL OR "machineProductCode" IS NOT NULL);
