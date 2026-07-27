BEGIN;

DELETE FROM "SimulateMessage" WHERE "phoneNumber" LIKE '%9048740132%';
DELETE FROM "TroubleshootingSession" WHERE "phoneNumber" LIKE '%9048740132%';
DELETE FROM "ManualComplaint" WHERE "phoneNumber" LIKE '%9048740132%';
DELETE FROM "ConversationSession" WHERE "phoneNumber" LIKE '%9048740132%';
DELETE FROM "Ticket" WHERE "phoneNumber" LIKE '%9048740132%';
DELETE FROM "MarketingLead" WHERE "phone" LIKE '%9048740132%';
DELETE FROM "User" WHERE "whatsappNumber" LIKE '%9048740132%';

COMMIT;
