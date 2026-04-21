# POORNASREE AI — PHASE 1 FINAL ARCHITECTURE (SINGLE SHEET)

────────────────────────────────────────────────────────

## 1. CORE SYSTEM SHIFT

OLD SYSTEM:
Web Chat + AI (RAG-first)

NEW SYSTEM:
WhatsApp-Driven Service Management System

KEY CHANGE:
Conversation → ❌
Ticket → ✅ (core entity)

AI Role:
Primary → ❌
Assistant (troubleshooting) → ✅

────────────────────────────────────────────────────────

## 2. END-TO-END FLOW

Customer (WhatsApp)
↓
Message received (Webhook)
↓
Session created (phone + serial)
↓
REGISTRATION

* Ask serial number
* Validate machine
  ↓
  PROBLEM INPUT
* User describes issue
  ↓
  PROBLEM CLASSIFICATION (AI/RAG)
* Identify problemType (NOT steps)
  ↓
  TROUBLESHOOTING ENGINE (Structured)
* Step 1 → user response
* Step 2 → user response
* Step N
  ↓
  Resolved?
  YES → END (no ticket)
  NO / HELP → CREATE TICKET
  ↓
  PINCODE ROUTING
  ↓
  SERVICE MANAGER (assign engineer)
  ↓
  ENGINEER HANDLING
  ↓
  OTP VERIFICATION (customer)
  ↓
  TICKET CLOSED
  ↓
  AUTO FEEDBACK (WhatsApp rating)
  ↓
  METRICS STORED

────────────────────────────────────────────────────────

## 3. SYSTEM ARCHITECTURE

ENTRY POINT:
POST /api/whatsapp/webhook

CORE COMPONENTS:

1. WhatsApp Service

* Receive/send messages
* Media handling

2. State Machine

* IDLE
* REGISTRATION
* TROUBLESHOOTING
* TICKET_CREATION
* OTP_PENDING
* FEEDBACK

3. Troubleshooting Engine

* problemType → steps
* step-by-step flow (controlled)

4. Ticket System (CORE)

* create / assign / update / close

5. OTP System

* generate / verify / expire

6. Pincode Routing

* assign based on location

7. AI (RAG)

* ONLY for problem classification

────────────────────────────────────────────────────────

## 4. CORE ENTITIES

Customer

* phoneNumber
* multiple serialNumbers allowed

Machine

* serialNumber
* model
* specs

WhatsAppSession

* phoneNumber + serial
* state
* currentStep

TroubleshootingTemplate

* problemType
* steps[]

Ticket

* ticketNumber
* customerId
* engineerId
* managerId
* pincode
* status
* mediaUrls
* otp
* feedback
* timestamps

OTP

* codeHash
* expiry
* attempts

Pincode

* mapping to engineers

Branding

* logo, name, theme

R&D Resource

* videos/docs (restricted)

────────────────────────────────────────────────────────

## 5. ROLES

Customer → WhatsApp only (no login)

Dealer

* create tickets
* optional troubleshooting

Service Manager

* assign tickets (pincode-based)

Service Engineer

* handle tickets
* close via OTP

Admin (R&D)

* documents
* branding
* pincodes
* system monitoring

────────────────────────────────────────────────────────

## 6. WHAT IS REMOVED

* Customer web UI
* Customer login
* Free-form AI chat
* Conversation/message-based system
* Old escalation logic

────────────────────────────────────────────────────────

## 7. WHAT IS REUSED

* RAG pipeline (for classification only)
* Document upload + indexing
* Auth system (for web roles)
* PostgreSQL + Docker setup

────────────────────────────────────────────────────────

## 8. KEY RULES (CRITICAL)

* System must be TEXT-DRIVEN (no UI dependency)
* One active troubleshooting session per (phone + serial)
* Multiple tickets per user allowed
* AI does NOT generate steps
* Steps come from structured templates
* WhatsApp is PRIMARY interface

────────────────────────────────────────────────────────

## 9. METRICS

* responseTime = firstEngineerAction - createdAt
* resolutionTime = closedAt - createdAt
* ticketAge
* feedbackRating

────────────────────────────────────────────────────────

## 10. EDGE HANDLING

* Invalid serial → block + notify
* No engineer → fallback to manager
* OTP failure → retry (3) → manager override
* No RAG match → ask user → troubleshoot or ticket
* Session timeout → reset after 24h
* Media failure → retry or continue without media
* Multiple issues → ask user to select one

────────────────────────────────────────────────────────

## 11. BUILD ORDER (HIGH LEVEL)

1. Ticket system (core)
2. Role system update
3. Troubleshooting engine (structured)
4. Pincode routing
5. OTP system
6. Engineer + Manager dashboards
7. WhatsApp integration
8. Media + feedback
9. Admin enhancements
10. Cleanup old system

────────────────────────────────────────────────────────

## 12. FINAL SYSTEM IDENTITY

WhatsApp Interface

* Guided Troubleshooting Engine
* Ticket Management System
* AI-Assisted Classification

NOT a chatbot anymore.

────────────────────────────────────────────────────────

END OF FINAL PLAN
────────────────────────────────────────────────────────