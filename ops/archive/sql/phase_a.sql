-- Phase A: Schema changes for Phase 1 features

-- 1. Machine Registry
CREATE TABLE IF NOT EXISTS "Machine" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "serialNumber" TEXT NOT NULL UNIQUE,
  "modelName" TEXT NOT NULL,
  "specs" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Branding (singleton)
CREATE TABLE IF NOT EXISTS "Branding" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "companyName" TEXT NOT NULL DEFAULT 'Poornasree',
  "logoUrl" TEXT,
  "address" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
  "tagline" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. R&D Video
CREATE TABLE IF NOT EXISTS "RdVideo" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "filePath" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Update ConversationSession: serialNumber and machineId already added
-- State migration: AWAITING_MOBILE → AWAITING_SERIAL
UPDATE "ConversationSession"
  SET "state" = 'AWAITING_SERIAL'
  WHERE "state" = 'AWAITING_MOBILE';

-- 5. Add machineSerialNumber to Ticket
ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "machineSerialNumber" TEXT;

-- 6. Seed default branding row
INSERT INTO "Branding" ("id", "companyName", "logoUrl", "address", "primaryColor", "tagline")
VALUES (gen_random_uuid(), 'Poornasree', NULL, NULL, '#2563eb', 'AI-Powered Service Management')
ON CONFLICT DO NOTHING;

-- Verify
SELECT 'Machine' AS tbl, COUNT(*) FROM "Machine"
UNION ALL SELECT 'Branding', COUNT(*) FROM "Branding"
UNION ALL SELECT 'RdVideo', COUNT(*) FROM "RdVideo";
