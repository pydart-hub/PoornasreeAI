# Poornasree — Ticket API (for external app developer)

**Base URL:** `https://poornasree.pydart.com`

---

## ℹ️ HTTP Methods & Browser/GET Support (No Auth)
> [!TIP]
> The state-changing actions (`start`, `otp`, `verify-otp`) support standard `PATCH`/`POST` requests, but **also support public `GET` request paths**.
> This allows you to run or test the entire cycle of endpoints directly in a web browser address bar or integrate via simple `GET` queries.

---

## Workflow Overview
Closing a ticket uses the **same database and business logic** whether the engineer uses:
- **Poornasree WhatsApp** (`START TKT-...`, `OTP TKT-...`, `VERIFY TKT-... 4232`)
- **Your External App (No Login)** via `/api/public/tickets/...`
- **Authenticated REST API** via `/api/tickets/...` (with Bearer Token)

| Action | HTTP Method | Public Endpoint (Standard) | Browser / GET Alternative | WhatsApp Command |
| :--- | :--- | :--- | :--- | :--- |
| **1. Start Work** | `PATCH` / `GET` | `/api/public/tickets/{id}/start` | `/api/public/tickets/{id}/start-work` | `START TKT-...` |
| **2. Request/Send OTP** | `POST` / `GET` | `/api/public/tickets/{id}/otp` | `/api/public/tickets/{id}/request-otp` | `OTP TKT-...` |
| **3. Resend OTP** | `POST` / `GET` | `/api/public/tickets/{id}/otp` (Body: `{"resend": true}`) | `/api/public/tickets/{id}/request-otp?resend=true` | `RESEND TKT-...` |
| **4. Verify OTP & Close** | `POST` / `GET` | `/api/public/tickets/{id}/verify-otp` (Body: `{"code": "1234"}`) | `/api/public/tickets/{id}/verify-otp-get?code=1234` | `VERIFY TKT-... 1234` |
| **5. Retrieve OTP** | `GET` | N/A | `/api/public/tickets/{id}/active-otp` *(returns plain code in JSON)* | N/A |

---

## 1. Ticket Action Endpoints (Public Flow)

### Step 1: Start Work
Changes the ticket status to `IN_PROGRESS`.
- **Method:** `PATCH`
- **URL:** `https://poornasree.pydart.com/api/public/tickets/{ticketId}/start`
- **Request Body:** None
- **Success Response (200 OK):**
  ```json
  {
    "ticket": {
      "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
      "ticketNumber": "TKT-20260604-F0B92422",
      "status": "IN_PROGRESS",
      "phoneNumber": "919048740132",
      "problemDescription": "Lactosure: Led not blinking",
      "assignedEngineerId": "f07f2470-56d5-4935-965c-83b015e81a7f"
    }
  }
  ```
- **Error Responses:**
  - `404 Not Found`: `{ "error": "Ticket not found" }`
  - `403 Forbidden`: `{ "error": "You are not assigned to this ticket" }` (Ticket must have an assigned engineer)

---

### Step 2: Request OTP
Generates a 4-digit OTP code and sends it to the customer via WhatsApp (the code is never returned in the API response).
- **Method:** `POST`
- **URL:** `https://poornasree.pydart.com/api/public/tickets/{ticketId}/otp`
- **Request Body:**
  ```json
  {
    "resend": false
  }
  ```
  *(Set `"resend": true` only if the ticket is already `PENDING_OTP` and you need to generate a new code)*
- **Success Response (200 OK):**
  ```json
  {
    "message": "OTP sent to the customer via WhatsApp.",
    "expiresAt": "2026-06-04T10:45:29.666Z"
  }
  ```
- **Error Responses:**
  - `409 Conflict`: `{ "error": "An active OTP already exists. Use resend to send it again." }`
  - `400 Bad Request`: `{ "error": "No engineer assigned to this ticket" }`

---

### Step 3: Verify OTP & Close Ticket
Verifies the customer's 4-digit OTP. If correct, transitions the ticket to `CLOSED` status.
- **Method:** `POST`
- **URL:** `https://poornasree.pydart.com/api/public/tickets/{ticketId}/verify-otp`
- **Request Body:**
  ```json
  {
    "code": "4232"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Ticket closed successfully",
    "ticket": {
      "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
      "ticketNumber": "TKT-20260604-F0B92422",
      "status": "CLOSED",
      "otpVerified": true,
      "closedAt": "2026-06-04T10:19:15.661Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{ "error": "code is required" }` / `{ "error": "OTP has expired" }`
  - `400 Bad Request`: `{ "error": "Invalid OTP. 2 attempt(s) remaining." }`
  - `423 Locked`: `{ "error": "OTP locked after 3 failed attempts. A Service Manager must override to close this ticket." }`

---

## 2. Listing & Reading Tickets by Stage (No Auth)

You can query tickets by their current workflow stage.

### Query Ticket List by Stage
- **Method:** `GET`
- **URL Pattern:** `https://poornasree.pydart.com/api/public/tickets/stage/{stage}`
  - **Available Stages (Canonical & Friendly Aliases):**
    - **New Ticket / Created:** `new` or `created` (resolves `OPEN` tickets)
    - **Assigned Ticket:** `assigned` (resolves `ASSIGNED` tickets)
    - **Engineer Started / In-Progress:** `started` or `in-progress` (resolves `IN_PROGRESS` tickets)
    - **Requested OTP / Generated OTP:** `requested-otp`, `generated-otp`, or `pending-otp` (resolves `PENDING_OTP` tickets)
    - **Closing List / Closed:** `closing-list` or `closed` (resolves `CLOSED` tickets)
- **Query Parameters (Optional):**
  - `page`: Page number (default: `1`)
  - `limit`: Items per page (default: `100`, max: `1000`)
  - `since`: Filter updated tickets since ISO 8601 datetime (e.g., `?since=2026-06-01T00:00:00Z`)
  - `ticketNumber`: Filter by specific ticket number (e.g., `?ticketNumber=TKT-20260604-F0B92422`)
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
        "ticketNumber": "TKT-20260604-F0B92422",
        "stage": "closed",
        "status": "CLOSED",
        "customer": {
          "name": "Admin Poornasree",
          "phone": "919048740132",
          "pincode": "679304"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 1,
      "pages": 1
    }
  }
  ```

### Get Single Ticket Details by Stage
- **Method:** `GET`
- **URL Pattern:** `https://poornasree.pydart.com/api/public/tickets/stage/{stage}/{ticketId}`
  - **Note:** Supports all the same friendly aliases (e.g. `new`, `started`, `requested-otp`, `closing-list`, etc.) as the stage parameter.
- **Success Response (200 OK):**
  *(Provides enriched information based on the stage, e.g. customer name/phone/address, machine name, engineer details, and stage timestamps)*

---

## 3. Webhooks & Integrations

### Optional Webhook Events
You can register a POST URL with Poornasree to receive automated JSON notifications on stage updates:
- `ticket.created`
- `ticket.assigned`
- `ticket.started`
- `ticket.otp_requested`
- `ticket.closed`

---

## 4. Code Examples

### cURL (Using standard POST/PATCH)
```bash
BASE="https://poornasree.pydart.com"
ID="60856ec6-ac70-4744-8f79-a081f277084a"

# 1. Start work
curl -s -X PATCH "$BASE/api/public/tickets/$ID/start"

# 2. Request OTP
curl -s -X POST "$BASE/api/public/tickets/$ID/otp" \
  -H "Content-Type: application/json" \
  -d '{"resend":false}'

# 3. Verify OTP (using customer code e.g. 4232)
curl -s -X POST "$BASE/api/public/tickets/$ID/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"code":"4232"}'
```

### cURL / Browser (Using GET shortcuts)
```bash
BASE="https://poornasree.pydart.com"
ID="60856ec6-ac70-4744-8f79-a081f277084a"

# 1. Start work
curl -s "$BASE/api/public/tickets/$ID/start-work"

# 2. Request OTP
curl -s "$BASE/api/public/tickets/$ID/request-otp"

# 3. Retrieve Active OTP Code (for testing/automation)
curl -s "$BASE/api/public/tickets/$ID/active-otp"

# 4. Verify OTP
curl -s "$BASE/api/public/tickets/$ID/verify-otp-get?code=4232"
```

### JavaScript / Fetch
```javascript
const BASE = "https://poornasree.pydart.com";
const ticketId = "60856ec6-ac70-4744-8f79-a081f277084a";

// Start Work (GET)
await fetch(`${BASE}/api/public/tickets/${ticketId}/start-work`);

// Request OTP (GET)
await fetch(`${BASE}/api/public/tickets/${ticketId}/request-otp`);

// Retrieve Active OTP (GET)
const otpRes = await fetch(`${BASE}/api/public/tickets/${ticketId}/active-otp`);
const { otp } = await otpRes.json();

// Verify OTP (GET)
await fetch(`${BASE}/api/public/tickets/${ticketId}/verify-otp-get?code=${otp}`);
```

---

## 5. Testing & Verification

For local developer E2E tests:
```powershell
cd PoornasreeAI/api
powershell -File tests/e2e/test-stage-e2e.ps1
```
