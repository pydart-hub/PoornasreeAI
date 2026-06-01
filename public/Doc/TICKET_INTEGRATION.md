# Poornasree — Ticket API (for external app developer)

**What it is:** Public read APIs to collect **service ticket + customer data** (name, phone, address, pincode, serial number, complaint, time created, etc.) at each stage: created → assigned → in progress → OTP pending → closed. No login required.

---

## Endpoints (production)

**Created (new tickets)**  
https://poornasree.pydart.com/api/public/tickets/stage/created

**Assigned (engineer assigned)**  
https://poornasree.pydart.com/api/public/tickets/stage/assigned

**In progress (work started)**  
https://poornasree.pydart.com/api/public/tickets/stage/in-progress

**Pending OTP (waiting for customer OTP)**  
https://poornasree.pydart.com/api/public/tickets/stage/pending-otp

**Closed (ticket finished)**  
https://poornasree.pydart.com/api/public/tickets/stage/closed

**One ticket:** add ticket UUID to the URL, e.g.  
https://poornasree.pydart.com/api/public/tickets/stage/created/`<ticket-id>`

**Filters (add to any list URL):** `?page=1&limit=100` · `?since=2026-06-01T00:00:00Z` · `?ticketNumber=TKT-20260601-ABCD1234`

**Response:** JSON with `"success": true` and `"data"` array of tickets (`customer`, `machine`, `complaint`, `timestamps`).

---

## Optional webhook

Your app gives Poornasree a `POST` URL; we send events when tickets change (`ticket.created`, `ticket.assigned`, `ticket.started`, `ticket.otp_requested`, `ticket.closed`). Same data as above.
