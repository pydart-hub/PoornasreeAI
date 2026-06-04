# WhatsApp template: engineer ticket assigned

When a service manager assigns a ticket, the API **always** notifies the engineer on their verified `whatsappNumber`:

1. Approved **utility template** (works outside the 24-hour session window)
2. Full ticket details (text) + **action buttons** (Start / OTP / etc.)

Manual assignment only (`PATCH /api/tickets/:id/assign-engineer`). There is no auto-assign in production flows.

---

## 1. Create the template in Meta

1. [Meta Business Suite](https://business.facebook.com) → **WhatsApp Manager** → Poornasree number.
2. **Message templates** → **Create template**.

| Field | Value |
|--------|--------|
| **Template name** | `engineer_ticket_assigned` |
| **Category** | **Utility** |
| **Language** | English |

### Body (6 variables)

```
Hi {{1}}, a new service ticket is assigned to you.

Ticket: {{2}}
Customer: {{3}}
Phone: {{4}}
Location: {{5}}
Issue: {{6}}

Open WhatsApp and use the buttons in the next message, or type TICKETS.
```

Sample values for review:

| Variable | Sample |
|----------|--------|
| {{1}} | Mhd Ijaz |
| {{2}} | TKT-20260604-3EC7B4F0 |
| {{3}} | Aph |
| {{4}} | +919048740132 |
| {{5}} | Chembra · 679304 |
| {{6}} | Vibro: not working |

No URL button required.

3. Submit and wait for **Approved**.

---

## 2. API configuration

```env
WA_ENGINEER_TICKET_TEMPLATE=engineer_ticket_assigned
WA_ENGINEER_TICKET_TEMPLATE_LANG=en
```

Redeploy the API after updating `.env`.

If the template is missing or rejected, the API still sends the **full session text + buttons** (works when the engineer has an active 24h window).

---

## 3. Engineer experience after assign

1. Template alert (short)
2. Full ticket block (name, **full phone**, address, complaint, …)
3. Buttons by status:
   - **ASSIGNED** → Start work · Details · All tickets
   - **IN_PROGRESS** → Request OTP · Service report · Details
   - **PENDING_OTP** → Enter OTP · Resend OTP · All tickets

`TICKETS` shows a list picker + summary. Service report menu supports diagnosis, work done, parts, warranty (buttons + text commands). See `HELP` on WhatsApp.

---

## 4. Troubleshooting

```bash
docker logs poornasree-ai-api-1 2>&1 | grep -E 'engineer-ticket-wa|whatsapp'
```

| Error | Fix |
|--------|-----|
| Template name does not exist | Name/language must match env |
| (#132000) Parameter count mismatch | Body must have exactly 6 variables |
| No message to engineer | Engineer `whatsappNumber` empty in dashboard |
