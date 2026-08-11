-- Add greeting fields and botName to ChatbotSetting table
ALTER TABLE "ChatbotSetting" ADD COLUMN IF NOT EXISTS "botName" TEXT NOT NULL DEFAULT 'Hari';
ALTER TABLE "ChatbotSetting" ADD COLUMN IF NOT EXISTS "welcomeGreeting" TEXT;
ALTER TABLE "ChatbotSetting" ADD COLUMN IF NOT EXISTS "afterHoursGreeting" TEXT;
ALTER TABLE "ChatbotSetting" ADD COLUMN IF NOT EXISTS "supportHandoffGreeting" TEXT;
