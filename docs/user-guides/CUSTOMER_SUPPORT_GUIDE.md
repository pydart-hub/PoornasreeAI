# Customer Support Agent Guide — PoornasreeAI

> **For**: Customer Support Desk Agents  
> **Access**: Web Dashboard (`/support-dashboard`)  
> **Role in System**: `customer_support`

---

## Introduction

As a **Customer Support Agent**, you monitor and manage all live WhatsApp customer sessions. The AI bot handles most conversations automatically — but when a customer needs a human, you step in, take over the chat, and communicate directly with them in the same WhatsApp thread.

---

## Accessing the Dashboard

| URL | `/support-dashboard` |
|---|---|
| **Username** | Your registered email |
| **Password** | Set via the activation email from Admin |

---

## Dashboard Layout

The support dashboard is a split-panel interface:

| Panel | Location | Purpose |
|---|---|---|
| **Session List** | Left sidebar | All active WhatsApp customer sessions |
| **Chat Window** | Centre | Full conversation history for the selected session |
| **Customer Context** | Right panel | Customer profile, machines, and ticket history |

---

## Session List (Left Sidebar)

The session list shows all active WhatsApp customer sessions. Each session entry shows:

- **Customer phone number** (or name if available)
- **Bot state** — Where in the chatbot flow this customer currently is (e.g., Greeting, Diagnostics, Ticket Booking)
- **Last message** — Most recent message text
- **Time** — When the last message was sent
- **Bot paused indicator** — Shows if the AI bot is currently paused (human active)

### Session Tabs

Filter sessions using the tabs at the top of the session list:

| Tab | What It Shows |
|---|---|
| **All** | Every active session |
| **Manual** | Sessions where customers typed a custom complaint in "Other" |
| **Bot** | Sessions where the AI bot is actively responding |

---

## Bot State Labels

Sessions show colour-coded state labels so you can quickly identify what phase the customer is in:

| Label | Colour | Meaning |
|---|---|---|
| **Greeting** | 🔵 Blue | Customer just started chatting |
| **Diagnostics** | 🟡 Amber | Customer is in troubleshooting flow |
| **Ticket Booking** | 🔴 Rose | Customer is raising a service request |
| **Warranty Check** | 🟢 Emerald | Warranty-related query |

---

## How to Take Over a Customer Chat

### Step 1 — Select a Session

Click on any session in the left panel to open the chat window.

You'll see:
- Full message history (user messages, AI bot responses, system messages)
- The customer's current bot state
- Any media (images) shared in the chat

### Step 2 — Pause the Bot

When you want to respond as a human:

1. Look for the **Bot Active** / **Bot Paused** toggle at the top of the chat window
2. Click **"Pause Bot"** (or the power-off toggle 🔴)
3. The session is now in **Human Active** mode — the AI bot will not respond to further messages from this customer
4. The session list shows this session as "Bot Paused"

### Step 3 — Reply to the Customer

Type your message in the reply box at the bottom of the chat window and press **Send** (or Enter).

Your message is sent directly to the customer on WhatsApp and appears in the chat thread.

> 💡 **Tip**: Introduce yourself when you first take over:  
> *"Hi! This is [Your Name] from Poornasree support. I'm here to help you. 😊"*

### Step 4 — Resume the Bot

When you've resolved the customer's issue and want the AI to take over again:

1. Click **"Resume Bot"** (or the power-on toggle 🟢)
2. The session returns to **Bot Active** mode
3. The AI bot will respond to the customer's next message normally

> ✅ Always resume the bot when you're done. Sessions left in Bot Paused mode will stay that way until manually resumed.

---

## Customer Context Panel (Right Side)

When you open a session, the right panel shows detailed information about the customer. Toggle it open/closed with the panel button.

### Profile Tab
- Customer name, email, phone, role, and registered location

### Machine Tab
- Machines registered to this customer
- For each machine: Serial number, model name, invoice number, invoice date, warranty months, and **warranty status** (Active / Expired, with days remaining)

### Tickets Tab
- All service tickets this customer has raised
- For each ticket: Ticket number, status, problem description, creation date, and assigned engineer name

Use this context to understand the customer's full history before responding.

---

## Handling Chat Messages

### Message Types in the Chat Window

| Message Type | What It Is |
|---|---|
| **User** (dark bubble) | Message sent by the customer via WhatsApp |
| **Bot** (lighter bubble) | Response from the AI chatbot |
| **Support** | Your reply (shown distinctly) |
| **System** | Automated system messages (e.g., OTP sent notifications) |

### Image Messages

If a customer sends an image, it appears in the chat. Click the image to **zoom in** for a larger view.

---

## Common Scenarios & How to Handle Them

| Situation | What to Do |
|---|---|
| Customer confused / not getting the right menu | Pause bot → guide them manually → resume when resolved |
| Customer requests to speak to a human | Pause bot → introduce yourself → help them |
| Customer has a language barrier | Respond in the appropriate language; create a ticket if needed |
| Customer wants to know ticket status | Check the **Tickets** tab in the context panel → relay the status |
| Customer's issue needs a field engineer | Direct them to type in the chat to raise a ticket, OR ask a Service Manager to manually raise one |

---

## Ticket Status Reference (for Customer Updates)

When customers ask about their ticket status:

| Status | What to Tell the Customer |
|---|---|
| **OPEN** | "Your request is received and we're assigning an engineer." |
| **ASSIGNED** | "An engineer has been assigned and will contact you soon." |
| **IN_PROGRESS** | "Our engineer is actively working on your case." |
| **PENDING_OTP** | "The engineer has finished the work. Check your WhatsApp for an OTP to confirm." |
| **CLOSED** | "Your ticket is resolved. Please contact us again if the issue persists." |

---

## Best Practices

- ✅ Monitor the session list regularly — respond to bot-paused sessions promptly
- ✅ Check the customer context panel before replying — know their history
- ✅ Always resume the bot after completing your interaction
- ✅ Keep your replies clear and professional
- ⚠️ Do not share confidential information (R&D videos, internal processes) with customers
- ⚠️ Do not modify or delete tickets — that is the Service Manager's responsibility

---

## Frequently Asked Questions

### Q: Can multiple support agents handle the same session?
**A:** Yes, but only one person should actively respond at a time. Coordinate with your team to avoid sending duplicate messages to the same customer.

### Q: What if I forget to resume the bot?
**A:** The session remains paused until you manually resume it. Check for any paused sessions at the start of your shift.

### Q: Can I send images or attachments to customers?
**A:** No, the current dashboard only supports text replies.

### Q: How do I know which sessions need urgent attention?
**A:** Look for sessions with a long time since the last message in the session list, or sessions where the customer has sent multiple messages without a reply.

### Q: What if I can't resolve the customer's issue?
**A:** Escalate to your Service Manager via phone or WhatsApp. Let the customer know you're connecting them with the right team.

---

*[← Back to User Guides Index](./README.md)*
