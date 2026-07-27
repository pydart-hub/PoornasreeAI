# Dealer / Authorized Partner Guide — PoornasreeAI

> **For**: Authorized Service Dealers and Partner Workshops  
> **Access**: Web Dashboard (`/dealer`) + WhatsApp Notifications  
> **Role in System**: `dealer`

---

## Introduction

As an **Authorized Dealer**, you receive service ticket assignments from the Service Manager and handle field visits in your territory. Your portal is focused and simple — it shows your assigned tickets and lets you take action on them (accept, reject, or complete).

---

## Initial Setup

Your account is created by the **Admin** or **Service Manager**. Once created, you'll receive an email with a **set-password link**. Click it to set your password before it expires (7 days).

Contact your Service Manager if the link expires before you can use it.

---

## Logging In

| URL | `/dealer` |
|---|---|
| **Username** | Your registered email |
| **Password** | Set via the activation email |

---

## Dashboard Overview

The dealer dashboard shows:

- **Sidebar** with quick stats (Total, Open, Closed ticket counts)
- **My Tickets** — the only navigation item (your entire work list)
- **Account Settings** — update your email or password
- **Status filter tabs** — quickly filter tickets by status

---

## Sidebar — Stats at a Glance

The left sidebar always shows:

| Stat | What It Means |
|---|---|
| **Total** | All tickets ever assigned to your account |
| **Open** | Tickets that are OPEN, ASSIGNED, or IN_PROGRESS (active work) |
| **Closed** | Tickets you've completed |

---

## Filtering Tickets

Use the **status tabs** at the top of the ticket list to filter:

| Tab | Tickets Shown |
|---|---|
| **All** | Every ticket assigned to you |
| **Open** | Tickets with OPEN status |
| **In Progress** | Tickets with IN_PROGRESS status |
| **Closed** | Completed tickets |

---

## Understanding Your Tickets

Each ticket card shows:
- **Ticket number** (e.g., `TKT-20260720-009`)
- **Status badge** (Open, Assigned, In Progress, Pending OTP, Closed)
- **Age** — How long since the ticket was created
- **Customer information** — Name, location (from machine address or pincode)
- **Machine details** — Model, serial number
- **Problem description** — What the customer reported
- **Pincode** — Customer's area
- **Warranty info** — Invoice number, invoice date, warranty months (from Passtest API)

Click a ticket to **expand it** and see full details + action buttons.

---

## Ticket Actions — Accept, Reject, Complete

When a Service Manager assigns a ticket to you, it arrives with a **pending** dealer response status. You'll also receive a **WhatsApp notification**.

### Accept a Ticket

Expand the ticket → Click **Accept** (green button with 👍).

This signals to the Service Manager that you're taking this job. They are notified, and you should contact the customer to schedule a visit.

### Reject a Ticket

Expand the ticket → Click **Reject** (red button with 👎).

This returns the ticket to the Service Manager to re-assign. The manager is notified.

> ⚠️ Repeatedly rejecting without good reason may affect your dealer rating.

### Mark as Complete

Once you've accepted a ticket and completed the field visit:

1. Expand the ticket → Click **Complete** (blue button with ✅)
2. The system moves the ticket to PENDING_OTP and sends an OTP to the customer's WhatsApp
3. Collect the 4-digit OTP from the customer on-site and enter it (if your dashboard shows an OTP field)

> ✅ Never mark a ticket as Complete unless the repair is finished and the customer is satisfied.

---

## What Happens After You Click Complete

1. Customer receives a WhatsApp message: *"Your OTP is: XXXX — Share this with the engineer."*
2. The customer shows you the 4-digit OTP
3. Enter the OTP to officially close the ticket
4. Ticket status moves to **CLOSED** ✅

---

## Raising a New Ticket (Dealer-initiated)

The dealer portal allows you to **create a new ticket** on behalf of a customer.

Click **"+"** (New Ticket) button → fill in:

| Field | Description |
|---|---|
| **Complaint type** | Select from the dropdown of known complaint types (sourced from admin documents) |
| **Custom description** | If the issue doesn't match any category, choose "Other" and describe in your own words |
| **Machine name** | Name/model of the machine |
| **Machine serial number** | Serial number (optional but recommended) |

Click **Submit**. The ticket is created and enters the Service Manager's queue.

> 💡 The complaint type dropdown is automatically populated from admin-uploaded troubleshooting documents.

---

## Account Settings

Click **"Account Settings"** in the sidebar to update your profile:

| Setting | Description |
|---|---|
| **Email** | Change your login email address |
| **Current Password** | Required to confirm identity before making changes |
| **New Password** | Set a new login password |
| **Confirm Password** | Re-enter the new password |

Click **Save** to apply changes.

---

## WhatsApp Notifications

You receive WhatsApp alerts when:
- A new ticket is assigned to you by a Service Manager
- A ticket is re-assigned away from you
- A customer updates or responds to a ticket

Make sure your WhatsApp number is registered correctly in the system. Contact your Service Manager if you stop receiving notifications.

---

## Important Rules

- ✅ Respond to ticket assignments (Accept/Reject) promptly — same day if possible
- ✅ Contact the customer to schedule a visit immediately after accepting
- ✅ Always collect the customer OTP before marking as complete
- ⚠️ Never mark a ticket complete without finishing the actual repair
- ⚠️ If you cannot attend a ticket you've already accepted, inform your Service Manager immediately

---

## Frequently Asked Questions

### Q: Can I see tickets assigned to other dealers?
**A:** No. You only see tickets assigned specifically to your dealer account.

### Q: The customer's OTP expired — what do I do?
**A:** Ask the customer to send a message on WhatsApp requesting a new OTP. The bot will send a fresh one. Or contact your Service Manager.

### Q: What if a ticket is wrongly assigned to me (wrong area)?
**A:** Click Reject and contact your Service Manager to explain. They will re-assign it correctly.

### Q: I accepted a ticket but now I can't do the job — what do I do?
**A:** Contact your Service Manager immediately via phone or WhatsApp. They will re-assign the ticket to avoid delays for the customer.

### Q: Where can I see the machine's warranty details?
**A:** Expand the ticket card. If the machine was verified via the Passtest system, the invoice number, date, and warranty months are shown directly on the ticket.

---

*[← Back to User Guides Index](./README.md)*
