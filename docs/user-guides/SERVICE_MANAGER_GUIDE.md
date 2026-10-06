# Service Manager Guide — PoornasreeAI

> **For**: Service Managers and Assistant Service Managers  
> **Access**: Web Dashboard (`/service-manager` or `/assistant-manager`)  
> **Role in System**: `service_manager` / `assistant_service_manager`

---

## Introduction

As a **Service Manager**, you are the central operations controller of the PoornasreeAI platform. You manage all service tickets, assign them to engineers and dealers, configure geographic zones (locations/pincodes), monitor dealer responses, review work reports, track engineer performance feedback, and now also monitor live engineer WhatsApp bot activity.

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
| **Engineer Chats** | 🆕 Monitor live engineer WhatsApp bot sessions (read-only audit view) |

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

### Export Tickets

Click the **Export** button (📥 icon) in the tickets view to download all visible ticket data as a `.csv`/spreadsheet file. Useful for monthly reporting and analysis.

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
- **Complaint media attachments** (voice notes, images, videos)
- **SLA performance panel** (response and resolution time tracking)
- **Engineer work report** (diagnosis, parts, photos — if submitted)

### Ticket Drawer — Action Bar

At the top of every open ticket drawer, a quick-action bar provides:

| Button | Action |
|---|---|
| **Call Customer** | Tap-to-call using the customer's registered phone number |
| **Assign / Reassign** | Open engineer assignment panel |
| **Assign Engineer (Backup)** | 🆕 Available on dealer-matched tickets — override with an internal engineer |
| **Assign to Dealer / View Dealer** | Open dealer assignment |
| **Cancel Assignment** | Remove current engineer assignment (notifies the engineer) |

### Ticket Drawer — SLA Performance Panel 🆕

Every open ticket now shows a real-time **SLA Performance** section:

| Metric | Target | What It Shows |
|---|---|---|
| **Response Time** | 4 hours | How long since ticket was raised until first assignment |
| **Resolution Time** | 72 hours | Total open age or actual resolution duration for closed tickets |

- 🟢 **On Track** — within target
- 🟡 **At Risk** — approaching limit
- 🔴 **Breached** — SLA target exceeded

Use this to escalate stalled tickets proactively.

### Ticket Drawer — Engineer Work Report 🆕

For tickets where an engineer has submitted a field service report, the drawer shows:

- **Problem Diagnosed** — engineer's diagnosis notes
- **Work Done** — what actions were performed
- **Parts Replaced** — count of replaced components
- **Photos** — thumbnail grid; each photo is labeled as **Reached** (arrival photo) or **Finished** (completed work photo). Click any thumbnail to enlarge.

### Ticket Drawer — Complaint Attachments 🆕

If the customer sent media during the WhatsApp complaint flow, the drawer shows:

- 🎙️ **Voice Notes** — inline audio playback
- 📹 **Video** — inline video player
- 🖼️ **Images** — clickable thumbnail view

### Ticket Drawer — Closure Note

If a dealer or engineer recorded a closure reason or note when completing the ticket, it appears as a highlighted green note block under Issue Details.

---

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

### Backup Option: Assign to Engineer Instead of Dealer 🆕

For tickets where a serial number matches an authorized dealer, or where a dealer has already been assigned, you now have a **Backup Option** inside the Assignment section:

- If a dealer is unavailable, unresponsive, or you prefer direct internal field handling, click **"Assign Engineer (Backup)"** in the action bar or the **"Backup Option: Assign to Engineer"** card inside the Assignment section of the ticket drawer.
- Select a zone-matched engineer from the list. Each engineer shows their active ticket count (🟢 0 tickets / 🟡 1–3 / 🔴 4+).
- Confirm the assignment. The system cleanly reassigns the ticket to the engineer, clears the dealer assignment, and sends a WhatsApp dispatch to the engineer.

> 💡 The confirmation step shows which dealer is being overridden — review before confirming.

### Assigning an Assistant Manager to a Ticket 🆕

Inside the Ticket Drawer, under the **Assignment** section, there is now an **Assistant Manager Assignment** panel:

- Shows which assistant manager is currently assigned to the ticket (if any).
- Click **"Assign Assistant Manager"** to assign one, or **"Change Assistant Manager"** to switch.
- The assistant will see this ticket in their `/assistant-manager` queue.

### Re-assigning

If the current assignee cannot attend, click the ticket → choose a different engineer or dealer. The old assignee is notified of removal.

### Archiving a Ticket

Closed tickets can be **locally archived** (hidden from your view) to reduce clutter. This is stored locally in your browser and does not affect the database.

---

## 2. Direct Service / Checkup Assignment 🆕

> **Access**: Click the **"+ Direct Assign"** or wrench (🔧) button in the Tickets view header.

This feature lets you dispatch an engineer for a **maintenance, calibration, or preventive visit** without requiring the customer to raise a ticket via WhatsApp.

### When to Use This

- Scheduled preventive maintenance visits
- Calibration and testing appointments
- Warranty checkups on request
- Emergency repair dispatch (no time to wait for customer to use WhatsApp)
- Any proactive field visit not triggered by a customer complaint

### How to Use

1. Click the **Direct Service / Checkup Assignment** button (wrench icon) in the Tickets header.
2. Fill in the form:

| Field | Required | Description |
|---|---|---|
| **Assignment Purpose / Task** | ✅ | Choose from presets: Routine Maintenance, Calibration & Testing, Preventive Checkup, Machine Inspection, Warranty Checkup, Emergency Repair Visit — or enter a custom purpose |
| **Assign to Engineer** | ✅ | Select the engineer; shows their active ticket count |
| **Customer / Dairy Name** | ⬜ | Name of the customer or dairy |
| **Customer Mobile / WhatsApp** | ⬜ | Their phone number (for engineer reference) |
| **Full Service Address** | ⬜ | Door number, street, landmark |
| **Pincode** | ⬜ | Auto-fills place, district, state from India location database |
| **Machine Model / Name** | ⬜ | e.g., Lactosure Eco |
| **Serial Number** | ⬜ | If provided, auto-fetches Passtest warranty data |
| **Instructions for Engineer** | ⬜ | Internal notes, e.g., "Verify ultrasonic transducer, replace tube kit" |

3. Click **"Assign Service Visit"**.
4. The engineer receives an instant WhatsApp notification with the assignment details.
5. A new ticket is created in the system (visible in your Tickets view).

---

## 3. Engineers

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

### Bulk Import Engineers via XLSX 🆕

Click the **Import** (📤) button in the Engineers view to upload a `.xlsx` spreadsheet with multiple engineers at once.

| Column | Required | Notes |
|---|---|---|
| First Name | ✅ | — |
| Last Name | ⬜ | — |
| Email | ✅ | Must be unique |
| WhatsApp Number | ⬜ | International format |

Each imported engineer receives a set-password link automatically.

### Editing an Engineer

Click the ✏️ Edit icon on any engineer to:
- Update name, email, WhatsApp number
- Change assigned pincode zones

### Removing an Engineer

Click 🗑️ Delete to remove an engineer from the system.

---

## 4. Feedback

The **Feedback** view shows customer satisfaction ratings collected after tickets are closed.

For each engineer, you'll see:
- **Closed count** — How many tickets they've resolved
- **Feedback count** — How many ratings were received
- **Average rating** — Average score on a 1–5 scale
- **Individual feedbacks** — Ticket number, rating, customer comment, and closure date

Use this to identify high-performing engineers and those who may need support.

---

## 5. Locations

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

## 6. Assistants

The **Assistants** view manages **Assistant Service Managers** who report to you.

For each assistant you'll see:
- Name, email, WhatsApp number
- Number of engineers they manage
- Their assigned pincode zones
- Join date

### Adding an Assistant

Click **"Add Assistant Manager"** → fill in their name, email, and WhatsApp number. A setup link is sent to their email.

Once set up, you can assign engineers to their management, and they will have access to the `/assistant-manager` dashboard.

### Bulk Import Assistants via XLSX 🆕

Click the **Import** button in the Assistants view to upload a `.xlsx` spreadsheet with multiple assistant managers in a single step.

---

## 7. Dealers

The **Dealers** view manages authorized dealer/partner accounts.

For each dealer you'll see:
- Name, email, WhatsApp number
- Warranty months configured for their account
- Their assigned pincode / territory
- Number of tickets handled
- Join date

### Adding a Dealer

Click **"Add Dealer"** → fill in their name, email, and WhatsApp number. A setup link is emailed.

### Bulk Import Dealers via XLSX 🆕

Click the **Import** button in the Dealers view to upload a `.xlsx` spreadsheet with multiple dealer accounts. Each imported dealer receives a setup link automatically.

### Editing / Deleting a Dealer

Click ✏️ Edit to update details or 🗑️ Delete to remove them.

---

## 8. Dealer Updates

The **Dealer Updates** view shows all dealer responses to ticket assignments — useful for monitoring response times and ensuring nothing is left unacknowledged.

For each update you'll see:
- Ticket number and problem description
- Dealer name and their response (`accepted` / `rejected` / `completed`)
- When the response was sent

If a dealer rejected a ticket, you'll need to re-assign it to another dealer or use the **Backup Engineer Assignment** option on the ticket.

---

## 9. Engineer Updates

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

## 10. Engineer Chats (WhatsApp Monitor) 🆕

> **Access**: Click **"Engineer Chats"** in the left sidebar.

The **Engineer Chats** view provides a **read-only WhatsApp Web-style interface** for monitoring your field engineers' live interactions with the Poornasree WhatsApp bot.

> 🔒 This is an **audit/inspection tool only**. You cannot send messages. Engineers are not notified that you are viewing.

### Layout

| Panel | Description |
|---|---|
| **Left — Chat List** | All engineers with WhatsApp bot conversations. Shows engineer name, last message, timestamp, and active ticket count badge. |
| **Centre — Chat Canvas** | Full conversation thread for the selected engineer. Bot messages and engineer messages are distinguished. YouTube links render with a film icon 🎬. |
| **Right — Contact Info Drawer** | Engineer profile (name, phone, email), assigned zone pincodes, and active field tickets with warranty status badges. |

### Using the Engineer Chat Monitor

1. Navigate to **Engineer Chats** in the sidebar.
2. The left panel lists all engineers who have used the WhatsApp bot.
3. Click any engineer to open their conversation in the centre panel.
4. Use the **search bar** to filter by engineer name, phone, email, or pincode.
5. Click the **Refresh** button (🔄) to reload the session list.
6. Click the **panel icon** (⊞) in the top-right of the chat canvas to toggle the Contact Info drawer.
7. In the Contact Info drawer, click any **active ticket card** to jump directly to that ticket in the Tickets view.

### Chat Message Types

| Message Style | Sender |
|---|---|
| 🟢 Green bubble (right-aligned) | Engineer (sent to bot) |
| ⬜ White bubble (left-aligned) | Poornasree Support Bot (response to engineer) |
| Centred pill | System event (e.g., OTP sent, ticket closed) |

### What to Look For

- Engineers who are stuck on a command or confused by the bot → assist them by phone
- Tickets that have been in `IN_PROGRESS` for a long time without photo/OTP updates → prompt the engineer
- Engineers requesting OTP when work isn't complete → coach on correct procedure

---

## Important Rules & Tips

- ✅ Assign every OPEN ticket as soon as possible — unassigned tickets are highlighted in red
- ✅ Check **Dealer Updates** daily to catch rejected tickets that need re-routing
- ✅ Check **Feedback** weekly to review engineer performance
- ✅ Use **Date Range** filters to report on monthly/weekly service activity
- ✅ Use **Direct Assign** for proactive maintenance visits — don't wait for customers to raise tickets
- ✅ Use **Backup Engineer Assignment** immediately when a dealer rejects or goes unresponsive
- ✅ Monitor **SLA panels** in ticket drawers to catch breach risk before it happens
- ✅ Use **Engineer Chats** to proactively coach engineers who seem stuck in their WhatsApp workflow
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

### Q: When should I use Direct Service Assignment instead of waiting for a customer ticket?
**A:** Use Direct Assign for any scheduled, proactive, or manager-initiated visit — routine maintenance, calibration checks, warranty follow-ups, or any case where the engineer needs to be dispatched before the customer raises a WhatsApp complaint.

### Q: What is the SLA target?
**A:** The platform uses a **4-hour response SLA** (time to first assignment after ticket creation) and a **72-hour resolution SLA** (total ticket open duration). These targets are shown in the SLA Performance section of every ticket drawer.

### Q: Can engineers see me monitoring their chats?
**A:** No. The Engineer Chat Monitor is a one-way audit view. Engineers are not notified when a manager views their chat.

### Q: How do I bulk import engineers?
**A:** Go to **Engineers** → click **Import** → upload a `.xlsx` file with the required columns (First Name, Last Name, Email, WhatsApp Number). Each imported engineer receives a setup link automatically.

---

*[← Back to User Guides Index](./README.md)*
