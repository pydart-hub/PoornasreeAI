-- WhatsApp "Speak to Support" contact details (admin-editable)
CREATE TABLE "ChatbotSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "supportPhone" TEXT NOT NULL DEFAULT '+91 94009 61291',
    "supportEmail" TEXT,
    "supportHours" TEXT,
    "supportNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ChatbotSetting" ("id", "supportPhone", "updatedAt")
VALUES ('default', '+91 94009 61291', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
