# Service Manager Guide — PoornasreeAI

> **For**: Service Managers and Assistant Service Managers  
> **Access**: Web Dashboard (`/service-manager` or `/assistant-manager`)  
> **Role in System**: `service_manager` / `assistant_service_manager`

---

## Introduction

As a **Service Manager**, you are the central operations controller of the PoornasreeAI platform. You manage all service tickets, assign them to engineers and dealers, configure geographic zones (locations/pincodes), monitor dealer responses, review work reports, and track engineer performance feedback.

The **Assistant Service Manager** has the same dashboard and views. They can be assigned to manage a subset of engineers and tickets.

---

## Accessing the Dashboard

| Role | URL |
|---|---|
| Service Manager | `/service-manager` |
| Assistant Service Manager | `/assistant-manager` |

Login with your registered email and password.

---

## Dashboard Header — Stat Cards

At the top of every page, you'll see 4 real-time stat cards:

| Card | What It Shows |
|---|---|
| **Total Tickets** | All active tickets (excluding archived) |
| **Open** | Tickets not yet assigned (highlighted red if any exist) |
| **Active** | Tickets currently assigned, in progress, or awaiting OTP |
| **Closed** | Completed tickets |

---

## Sidebar Navigation

The left sidebar has the following sections:

| Section | What It Shows |
|---|---|
| **Tickets** | Full ticket management view |
| **Engineers** | Manage your team of service engineers |
| **Feedback** | Engineer performance ratings from closed tickets |
| **Locations** | Manage pincode zones assigned to you |
| **Assistants** | View and manage Assistant Service Managers |
| **Dealers** | Manage authorized dealer accounts |
| **Dealer Updates** | See dealer responses (accepted/rejected) on assigned tickets |
| **Engineer Updates** | View work reports submitted by engineers |

---

## 1. Tickets

The **Tickets** view is where you spend most of your time. It shows all tickets (excluding archived ones).

### Filtering Tickets

Use the filter bar to narrow down tickets by:

| Filter | Options |
|---|---|
| **Date Range** | All / Today / Last 7 days / Last 30 days |
| **Search** | Search by customer name, ticket number, serial number, or complaint text |
| **Dealer** | Filter by specific dealer assignment |
| **Machine Model** | Filter by machine model name |
| **Complaint Type** | Filter by issue/complaint category |

Click the **Filter** button to show/hide the filter bar.

### Ticket Status Flow

| Status | Meaning |
|---|---|
| **OPEN** | Ticket created by customer; needs assignment |
| **ASSIGNED** | Assigned to engineer or dealer; awaiting field visit |
| **IN_PROGRESS** | Engineer/dealer is actively working |
| **PENDING_OTP** | Job complete; OTP sent to customer; awaiting verification |
| **CLOSED** | OTP verified; ticket fully resolved |

### Opening a Ticket

Click any ticket card to open the **Ticket Drawer** — a side panel showing full details:

- Customer name, phone, location, pincode
- Machine info (serial number, model, Passtest warranty data)
- Problem description (auto-collected from WhatsApp conversation)
- Assignment history and current status
- Dealer response status

### Assigning a Ticket to an Engineer

In the ticket drawer or ticket card:

1. Click **"Assign Engineer"**
2. A dropdown shows engineers in the customer's pincode zone
3. Select an engineer → assignment is saved
4. The engineer receives a WhatsApp notification immediately

### Assigning a Ticket to a Dealer

1. Click **"Assign Dealer"**
2. Select a dealer from the dropdown
3. The dealer receives a WhatsApp notification

### Re-assigning

If the current assignee cannot attend, click the ticket → choose a different engineer or dealer. The old assignee is notified of removal.

### Archiving a Ticket

Closed tickets can be **locally archived** (hidden from your view) to reduce clutter. This is stored locally in your browser and does not affect the database.

---

## 2. Engineers

The **Engineers** view shows all service engineers in your team.

For each engineer you can see:
- Name, email, WhatsApp number
- Number of active tickets
- Assigned pincode zones
- Setup status (✅ Setup complete / ⚠️ Pending setup)
- Whether they are synced from the HR system

### Adding a New Engineer

Click **"Add Engineer"** and fill in:
- First name, last name
- Email
- WhatsApp number (international format: `919876543210`)
- Pincode zones to assign

After creation, a **set-password link** is sent to the engineer's email (or WhatsApp if number is provided). The engineer uses this link to set their own password.

If the link expires, click **"Resend Setup Link"** on the engineer's row.

### Editing an Engineer

Click the ✏️ Edit icon on any engineer to:
- Update name, email, WhatsApp number
- Change assigned pincode zones

### Removing an Engineer

Click 🗑️ Delete to remove an engineer from the system.

---

## 3. Feedback

The **Feedback** view shows customer satisfaction ratings collected after tickets are closed.

For each engineer, you'll see:
- **Closed count** — How many tickets they've resolved
- **Feedback count** — How many ratings were received
- **Average rating** — Average score on a 1–5 scale
- **Individual feedbacks** — Ticket number, rating, customer comment, and closure date

Use this to identify high-performing engineers and those who may need support.

---

## 4. Locations

The **Locations** view shows all pincode zones assigned to you (the Service Manager).

For each pincode, you can see:
- Pincode code (e.g., `600001`)
- Place, district, state
- Which engineers are assigned to that zone

### Adding a Pincode to Your Zones

Click **"Add Location"** → search and select a pincode from the India location database → confirm.

Once added, tickets raised from that pincode area will appear in your queue, and the matched engineers will be suggested for assignment.

### Removing a Pincode from Your Zones

Click 🗑️ on a pincode to remove it from your zone (does not delete the pincode from the system).

---

## 5. Assistants

The **Assistants** view manages **Assistant Service Managers** who report to you.

For each assistant you'll see:
- Name, email, WhatsApp number
- Number of engineers they manage
- Their assigned pincode zones
- Join date

### Adding an Assistant

Click **"Add Assistant Manager"** → fill in their name, email, and WhatsApp number. A setup link is sent to their email.

Once set up, you can assign engineers to their management, and they will have access to the `/assistant-manager` dashboard.

---

## 6. Dealers

The **Dealers** view manages authorized dealer/partner accounts.

For each dealer you'll see:
- Name, email, WhatsApp number
- Warranty months configured for their account
- Their assigned pincode / territory
- Number of tickets handled
- Join date

### Adding a Dealer

Click **"Add Dealer"** → fill in their name, email, and WhatsApp number. A setup link is emailed.

### Editing / Deleting a Dealer

Click ✏️ Edit to update details or 🗑️ Delete to remove them.

---

## 7. Dealer Updates

The **Dealer Updates** view shows all dealer responses to ticket assignments — useful for monitoring response times and ensuring nothing is left unacknowledged.

For each update you'll see:
- Ticket number and problem description
- Dealer name and their response (`accepted` / `rejected` / `completed`)
- When the response was sent

If a dealer rejected a ticket, you'll need to re-assign it to another dealer.

---

## 8. Engineer Updates

The **Engineer Updates** view shows **Work Reports** submitted by engineers after completing a ticket.

For each report you'll see:
- Ticket number and customer details
- Machine info and complaint
- Problem diagnosed
- Work done
- Parts replaced (with part names, numbers, quantities)
- Photos of replaced components
- Whether a warranty claim was requested

Use this to verify quality of field work, confirm warranty eligibility, and keep service records.

---

## Important Rules & Tips

- ✅ Assign every OPEN ticket as soon as possible — unassigned tickets are highlighted in red
- ✅ Check **Dealer Updates** daily to catch rejected tickets that need re-routing
- ✅ Check **Feedback** weekly to review engineer performance
- ✅ Use **Date Range** filters to report on monthly/weekly service activity
- ⚠️ Do not archive tickets that are still open — archiving is for completed tickets only
- ⚠️ If a ticket is stuck in PENDING_OTP, contact the customer or the engineer to resolve the OTP handoff

---

## Frequently Asked Questions

### Q: Can I manually close a ticket without an OTP?
**A:** You cannot directly override the OTP from your dashboard. Contact the Admin if a ticket needs to be force-closed.

### Q: Why don't some engineers show up when assigning?
**A:** Only engineers whose pincode zones match the customer's pincode are shown. If no engineers are shown, add the pincode to an engineer's zone in the **Locations/Engineers** section.

### Q: How are Assistant Managers different from Service Managers?
**A:** Both have the same dashboard views. Assistants may manage a sub-team of engineers. The role is mainly a permission/hierarchy distinction.

### Q: Can I see the full customer chat that led to a ticket?
**A:** The ticket drawer shows the **issue description** collected during the chat. Full conversation history is available via the **Customer Support Dashboard** (accessible to support agents and admins).

### Q: What is the difference between Dealer Updates and Engineer Updates?
**A:** **Dealer Updates** tracks how dealers respond to ticket assignments (accept/reject). **Engineer Updates** shows detailed Work Reports filed by engineers after completing tickets.

---

*[← Back to User Guides Index](./README.md)*
