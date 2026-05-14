-- ============================================================
-- clear-customer-data.sql
-- Clears ALL tickets and customer-related data.
-- Preserves: admin / service / engineer / manager / dealer /
--            sales users, pincodes, products, machines,
--            branding, documents, R&D videos, marketing leads,
--            troubleshooting templates, video resources.
--
-- Deletion order respects FK constraints:
--   1. Standalone tables (no inbound FKs)
--   2. Ticket  →  cascades → WorkReport → ReplacedPart / WorkReportImage
--   3. User(customer)  →  cascades → Conversation → Message / TrainingFeedback
--                                 → SupportRequest → SupportMessage
-- ============================================================

BEGIN;

-- 1. Standalone simulation / session tables
DELETE FROM "SimulateMessage";
DELETE FROM "ConversationSession";
DELETE FROM "TroubleshootingSession";

-- 2. All tickets (cascade deletes WorkReport, ReplacedPart, WorkReportImage)
DELETE FROM "Ticket";

-- 3. All customer users (cascade deletes Conversations, Messages,
--    TrainingFeedback, SupportRequests, SupportMessages)
DELETE FROM "User" WHERE role = 'customer';

COMMIT;

-- Verification (row counts should all be 0)
SELECT 'Ticket'               AS tbl, COUNT(*) AS remaining FROM "Ticket"
UNION ALL
SELECT 'User (customer)',               COUNT(*) FROM "User"            WHERE role = 'customer'
UNION ALL
SELECT 'Conversation',                  COUNT(*) FROM "Conversation"
UNION ALL
SELECT 'Message',                       COUNT(*) FROM "Message"
UNION ALL
SELECT 'SupportRequest',                COUNT(*) FROM "SupportRequest"
UNION ALL
SELECT 'SupportMessage',                COUNT(*) FROM "SupportMessage"
UNION ALL
SELECT 'WorkReport',                    COUNT(*) FROM "WorkReport"
UNION ALL
SELECT 'SimulateMessage',               COUNT(*) FROM "SimulateMessage"
UNION ALL
SELECT 'ConversationSession',           COUNT(*) FROM "ConversationSession"
UNION ALL
SELECT 'TroubleshootingSession',        COUNT(*) FROM "TroubleshootingSession";
