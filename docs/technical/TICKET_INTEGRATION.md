# Poornasree — Ticket API (for external app developer)

Click any of the links below to instantly fetch the live data in your browser.

---

## 1. Fetch Tickets by Status (Live Data)

Use these links to pull all tickets currently in a specific stage. The response includes complete customer, machine, and complaint data.

- **New / Created Tickets:**
  `https://poornasree.pydart.com/api/public/tickets/stage/new`
  
- **Assigned Tickets:**
  `https://poornasree.pydart.com/api/public/tickets/stage/assigned`
  
- **Started / In-Progress Tickets:**
  `https://poornasree.pydart.com/api/public/tickets/stage/in-progress`
  
- **Pending OTP / Generated OTP Tickets:**
  `https://poornasree.pydart.com/api/public/tickets/stage/pending-otp`
  
- **Closed Tickets:**
  `https://poornasree.pydart.com/api/public/tickets/stage/closed`

---

## 2. Engineer Actions (Ticket Lifecycle)

When your engineer performs an action on a specific ticket, use these links (replace `{ticketId}` with the actual ID).

- **Start Work:**
  `https://poornasree.pydart.com/api/public/tickets/{ticketId}/start`
  
- **Request OTP (Sends WhatsApp to Customer):**
  `https://poornasree.pydart.com/api/public/tickets/{ticketId}/otp`
  
- **Get Active OTP Code (For Testing/Automation):**
  `https://poornasree.pydart.com/api/public/tickets/{ticketId}/active-otp`
  
- **Verify OTP & Close Ticket (Replace 1234 with the actual code):**
  `https://poornasree.pydart.com/api/public/tickets/{ticketId}/verify-otp?code=1234`

---

## 3. Example JSON Response (Fetching Tickets)

When you call any of the stage links (like `/stage/new`), you receive the full ticket details:

```json
{
  "success": true,
  "data": [
    {
      "id": "2fbeed47-a2e3-460d-8659-d062b933d7eb",
      "ticketNumber": "TKT-20260604-F0B92422",
      "stage": "created",
      "status": "OPEN",
      "customer": {
        "name": "Admin Poornasree",
        "phone": "919048740132",
        "address": "Kochi, Kerala",
        "pincode": "679304",
        "place": "Kochi",
        "district": "Ernakulam",
        "state": "Kerala"
      },
      "machine": {
        "name": "Lactosure",
        "serialNumber": "SN-12345",
        "productCode": "LAC-001",
        "invoiceNo": "INV-992",
        "invoiceDate": "2023-01-15",
        "warrantyMonths": 12
      },
      "complaint": {
        "problemDescription": "Lactosure: Led not blinking",
        "issueDescription": "Customer reported LED not turning on when plugged in."
      },
      "dealer": null,
      "engineer": null,
      "timestamps": {
        "createdAt": "2026-06-04T10:15:00.000Z",
        "assignedAt": null,
        "workStartedAt": null,
        "otpExpiresAt": null,
        "otpRequestedAt": null,
        "closedAt": null
      },
      "stageMeta": {
        "ageHours": 0.1
      }
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 1, "pages": 1 }
}
```

---

## 4. Webhook Integrations (Optional)

If your app needs to be pushed data instantly instead of polling the `GET` links, we can configure a webhook POST to your server on the following events:
- `ticket.created`
- `ticket.assigned`
- `ticket.started`
- `ticket.otp_requested`
- `ticket.closed`
