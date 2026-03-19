# PoornasreeAI - Real-World Simulation Test Plan

## Overview
This test plan covers **5 scenario categories** that go beyond basic API testing to uncover real-world failure points in the ticket lifecycle, role isolation, OTP security, and chat simulation flows.

---

## Category 1: Normal Flow (Happy Path)

### T1.1 — Full Ticket Lifecycle (Dealer -> Engineer -> Close)
1. Dealer logs in and creates a ticket (auto-assigns to engineer)
2. Admin re-assigns to a specific engineer
3. Engineer starts work
4. Engineer requests OTP
5. Engineer verifies OTP
6. Ticket status is `CLOSED` with `closedAt` set

### T1.2 — Manager Assigns Engineer
1. Admin creates a ticket that lands in `OPEN` (no available engineer)  
   *(pre-condition: may need to test with no engineers in pincode)*
2. Admin assigns manager
3. Manager assigns engineer
4. Engineer completes lifecycle

### T1.3 — Simulate Chat Registration + Troubleshooting
1. New phone number → `NEW_USER`
2. Provide serial number → `REGISTERED`
3. Describe problem → RAG/template response
4. Say "YES" → next step returned
5. Say "HELP" → ticket auto-created

### T1.4 — Multi-Ticket Dealer Session
1. Dealer creates 3 tickets in succession
2. All get unique ticket numbers
3. Each auto-assigned (possibly different engineers)
4. Dealer can list all 3

---

## Category 2: Failure Scenarios

### T2.1 — Wrong OTP (3 attempts → 423 lockout)
1. Engineer starts work → requests OTP
2. Verify with wrong code → 400 "Invalid OTP. 2 attempt(s) remaining."
3. Wrong again → 400 "Invalid OTP. 1 attempt(s) remaining."
4. Wrong again → 423 "OTP locked after 3 failed attempts"
5. Correct code after lockout → still 423

### T2.2 — Expired OTP
1. Engineer requests OTP
2. *(Simulate expiry by directly updating DB or waiting 30 min)*
3. Verify with correct code → 400 "OTP has expired"

### T2.3 — Unauthorized Role Actions
| Action | Wrong Role | Expected |
|--------|-----------|----------|
| Create ticket | engineer | 403 |
| Create ticket | customer | 403 |
| Assign manager | dealer | 403 |
| Assign manager | engineer | 403 |
| Assign engineer | dealer | 403 |
| Start work | dealer | 403 |
| Request OTP | dealer | 403 |
| Verify OTP | dealer | 403 |

### T2.4 — Wrong Engineer Tries to Start Work
1. Ticket assigned to engineer1
2. engineer2 tries `PATCH /tickets/:id/start` → 403 "You are not assigned"

### T2.5 — Unassigned Ticket Start
1. If ticket stays in `OPEN`, try start → 400 "must be ASSIGNED"

---

## Category 3: Edge Cases

### T3.1 — Skip Status Steps
| Attempt | Current Status | Action | Expected Error |
|---------|---------------|--------|----------------|
| Start before assigned | OPEN | start | 400 "must be ASSIGNED" |
| Request OTP before start | ASSIGNED | otp | 400 "must be IN_PROGRESS" |
| Verify OTP before request | IN_PROGRESS | verify-otp | 400 "must be PENDING_OTP" |
| Close already closed | CLOSED | verify-otp | 400 "must be PENDING_OTP" |

### T3.2 — Double OTP Request
1. Engineer requests OTP (gets code A)
2. Engineer requests OTP again (gets code B)
3. Old code A should no longer work
4. New code B should work

### T3.3 — Re-assign Engineer Mid-Flow
1. Ticket is IN_PROGRESS with engineer1
2. Admin re-assigns to engineer2 → should this succeed or fail?
3. Test: `assignEngineer` on IN_PROGRESS ticket → 400 (only OPEN/ASSIGNED)

### T3.4 — Concurrent Ticket Creation
1. Two dealers create tickets simultaneously
2. Both get unique ticket numbers
3. Both auto-assign correctly (no race condition on engineer selection)

### T3.5 — Duplicate Machine Serial Number
1. Admin creates machine with serial "ABC123"
2. Admin tries to create another with serial "ABC123" → 409 / unique constraint

### T3.6 — Empty / Missing Fields
1. Create ticket with empty `problemDescription` → validation error
2. Create ticket without `machineSerialNumber` → should still succeed (nullable)
3. Verify OTP with empty body → 400

---

## Category 4: Multi-User Simulation

### T4.1 — Role Isolation: Dealer Only Sees Own Tickets
1. Dealer A creates ticket
2. Dealer B creates ticket
3. Dealer A lists tickets → only sees own
4. Dealer B lists tickets → only sees own

### T4.2 — Role Isolation: Engineer Only Sees Assigned Tickets
1. Create ticket → auto-assigned to engineer1
2. Create ticket → auto-assigned to engineer2 (or round-robin)
3. Engineer1 lists tickets → only sees their assigned
4. Engineer2 lists tickets → only sees their assigned

### T4.3 — Manager Pincode Scope
1. Manager (Chennai 600001) lists tickets → only Chennai tickets
2. Manager lists engineers → only Chennai engineers
3. Cross-pincode ticket invisible to manager

### T4.4 — Admin Sees Everything
1. Admin lists all tickets → sees all from all dealers/pincodes
2. Admin can start/OTP/verify on any ticket (admin override)

### T4.5 — Simulate Chat: Multiple Phone Numbers
1. Phone A registers with serial X → troubleshooting flow
2. Phone B registers with serial Y → independent session
3. Each phone maintains its own conversation state

---

## Category 5: Validation & Consistency

### T5.1 — Status Transition Enforcement
For each status, verify that ONLY the valid next-action succeeds:
| Current | Valid Action | All Other Actions Should Fail |
|---------|-------------|-------------------------------|
| OPEN | assign-manager, assign-engineer | start, otp, verify-otp |
| ASSIGNED | assign-engineer, start | assign-manager, otp, verify-otp |
| IN_PROGRESS | otp | assign-manager, start, verify-otp |
| PENDING_OTP | verify-otp | assign-manager, start, otp (re-request allowed) |
| CLOSED | none | all should fail |

### T5.2 — Data Consistency After Full Lifecycle
1. Complete a full ticket lifecycle
2. Verify final ticket has:
   - `status === "CLOSED"`
   - `closedAt` is set
   - `firstEngineeredAt` is set
   - `otpVerified === true`
   - `assignedEngineerId` is set

### T5.3 — Ticket Number Uniqueness
1. Create 10 tickets rapidly
2. All 10 have unique `ticketNumber` values
3. All follow format `TKT-YYYYMMDD-NNN`

### T5.4 — Timestamp Ordering
1. Complete a lifecycle
2. Verify: `createdAt < firstEngineeredAt < closedAt`

---

## Test Matrix Summary

| ID | Scenario | Category | Priority |
|----|----------|----------|----------|
| T1.1 | Full ticket lifecycle | Normal | P0 |
| T1.2 | Manager assigns engineer | Normal | P1 |
| T1.3 | Chat registration + troubleshoot | Normal | P0 |
| T1.4 | Multi-ticket dealer | Normal | P1 |
| T2.1 | Wrong OTP lockout | Failure | P0 |
| T2.2 | Expired OTP | Failure | P1 |
| T2.3 | Unauthorized role actions | Failure | P0 |
| T2.4 | Wrong engineer start | Failure | P0 |
| T2.5 | Unassigned ticket start | Failure | P1 |
| T3.1 | Skip status steps | Edge | P0 |
| T3.2 | Double OTP request | Edge | P1 |
| T3.3 | Re-assign mid-flow | Edge | P2 |
| T3.4 | Concurrent ticket creation | Edge | P1 |
| T3.5 | Duplicate machine serial | Edge | P2 |
| T3.6 | Empty/missing fields | Edge | P1 |
| T4.1 | Dealer isolation | Multi-User | P0 |
| T4.2 | Engineer isolation | Multi-User | P0 |
| T4.3 | Manager pincode scope | Multi-User | P1 |
| T4.4 | Admin omniscience | Multi-User | P1 |
| T4.5 | Chat multi-phone | Multi-User | P2 |
| T5.1 | Status transition enforcement | Validation | P0 |
| T5.2 | Data consistency after close | Validation | P0 |
| T5.3 | Ticket number uniqueness | Validation | P1 |
| T5.4 | Timestamp ordering | Validation | P1 |
