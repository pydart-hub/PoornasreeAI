-- CreateTable LlmUsageLog
CREATE TABLE IF NOT EXISTS "LlmUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'groq',
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'general',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "callerPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable WhatsAppMessageLog
CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "templateName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'service',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "costInr" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.004,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessageLog_waMessageId_key" ON "WhatsAppMessageLog"("waMessageId");
CREATE INDEX IF NOT EXISTS "LlmUsageLog_provider_createdAt_idx" ON "LlmUsageLog"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "LlmUsageLog_feature_createdAt_idx" ON "LlmUsageLog"("feature", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_recipientPhone_createdAt_idx" ON "WhatsAppMessageLog"("recipientPhone", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_status_createdAt_idx" ON "WhatsAppMessageLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageLog_category_createdAt_idx" ON "WhatsAppMessageLog"("category", "createdAt");
