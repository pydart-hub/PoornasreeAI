# Field Service Engineer WhatsApp Guide — PoornasreeAI

> **For**: Service Engineers assigned to field service visits  
> **Primary Channel**: WhatsApp Messenger (+91 94009 61291)  
> **Role in System**: `service_engineer`

---

## Overview

As a **Field Service Engineer**, your entire daily workflow—from receiving new ticket notifications to photo verification, service report submission, OTP verification, and closing tickets—can be performed directly inside **WhatsApp**.

---

## 1. Initial Setup & Onboarding

### Receiving Your WhatsApp Activation

When your Service Manager creates your engineer account in PoornasreeAI:

1. You will receive an official WhatsApp message template:
   ```
   Welcome to Poornasree Service Team, Suresh!

   You have been registered as a Service Engineer by Manager Rajesh Kumar.

   [Set Password] (Button)
   ```
2. Tap the **Set Password** button to set your password online.
3. Once set, send **`HI`** or **`MENU`** to the Poornasree WhatsApp number to open your Engineer Portal menu.

---

## 2. Engineer WhatsApp Portal Menu

Send **`HI`**, **`HELLO`**, or **`MENU`** at any time to open the main menu:

```
👋 Hi Suresh! Poornasree Engineer Portal.

What would you like to do?
[ 📋 My Tickets ]
[ 🔍 Troubleshoot ]
[ ❓ Help ]
```

### Main Menu Options

| Button / Command | Action |
|---|---|
| 📋 **My Tickets** (`TICKETS`) | View your assigned active tickets in an interactive list picker |
| 🔍 **Troubleshoot** (`TROUBLESHOOT`) | Guided step-by-step machine troubleshooting or search training videos |
| ❓ **Help** (`HELP`) | Quick guide on WhatsApp commands and features |
| 📊 **STATUS** | Check summary count of your tickets by status (Assigned, In Progress, Pending OTP, Closed) |

---

## 3. Receiving New Ticket Assignments

When a Service Manager assigns a ticket to you, you receive an instant WhatsApp alert:

```
📋 NEW SERVICE TICKET ASSIGNED

Hi Suresh, a new service ticket is assigned to you.

Ticket: TKT-20260723-004
Customer: Raju Kumar
Phone: +919876543210
Location: Anna Nagar, Chennai · 600001
Issue: Lactosure Pro — E4 Error and beeping sound

[ Start Work ]  [ Details ]  [ All Tickets ]
```

---

## 4. Complete WhatsApp Field Service Workflow

To complete a job and close a ticket, follow this 5-step flow on WhatsApp:

```
1. Start Work ──► 2. Upload Arrival Photo ──► 3. Service Report ──► 4. Upload Finished Photo ──► 5. Request & Enter OTP
```

---

### Step 1: Start Work

When you begin traveling or arrive at the site:
- Tap **`Start Work`** button, or type:
  ```
  START TKT-20260723-004
  ```
- Ticket status changes from **`ASSIGNED`** ➔ **`IN_PROGRESS`**.

---

### Step 2: Upload Arrival Photo (Product Location Photo)

Before entering report details or requesting an OTP, you must upload a photo of the machine upon arrival:
1. Send a photo of the machine via WhatsApp.
2. The bot will prompt: *"Which ticket does this photo belong to?"*
3. Select your ticket. The photo is saved as **`reached_location`** proof.

> ⚠️ *Arrival photo is mandatory before submitting diagnosis notes or requesting OTP.*

---

### Step 3: Complete Service Report & Parts

Tap **`Service Report`** button or use the text commands:

#### a) Problem Diagnosed
- Tap **`Diagnose`** or type:
  ```
  DIAGNOSE TKT-20260723-004 Sensor board faulty due to voltage spike
  ```

#### b) Work Done / Notes
- Tap **`Work Done`** or type:
  ```
  NOTE TKT-20260723-004 Replaced main sensor PCB and recalibrated channels
  ```

#### c) Warranty Claim
- Tap **`Yes, Warranty`** or **`No Warranty`** button when prompted.

#### d) Replaced Parts (Optional)
- Type part details in the format: **`PART <ticket> Name | PartNumber | Quantity`**
  ```
  PART TKT-20260723-004 Sensor PCB | PCB-E4-01 | 1
  ```

---

### Step 4: Upload Finished Work Photo

After completing the repair:
1. Send a photo of the repaired, working machine.
2. Select your ticket when prompted. The photo is saved as **`finished_work`** proof.

> ⚠️ *Finished work photo is mandatory before requesting customer OTP.*

---

### Step 5: Request & Verify Customer OTP

#### Requesting OTP
- Tap **`Request OTP`** or type:
  ```
  OTP TKT-20260723-004
  ```
  *(Note: The system checks that arrival photo, service report, and finished photo are complete before sending OTP).*

- The customer receives a **4-digit OTP** on their WhatsApp:
  ```
  🔐 Your OTP to confirm service visit is 7453. Share this with engineer Suresh.
  ```

#### Entering & Verifying OTP
- Simply reply with the **4-digit code** directly:
  ```
  7453
  ```
  or type:
  ```
  VERIFY TKT-20260723-004 7453
  ```

- Once verified:
  ```
  🎉 Ticket TKT-20260723-004 has been CLOSED successfully!
  A feedback request has been sent to the customer.
  ```
- Ticket status moves to **`CLOSED`** ✅.

---

## 5. Trial / Test Complaints (Quick Close)

For test calls, trial complaints, or situations where no physical service was needed:
- Tap **`Test Close`** button, or type:
  ```
  TESTCLOSE TKT-20260723-004
  ```
- This automatically logs the report as a customer test call and prompts for OTP closure without requiring parts/photos.

---

## 6. Technical Video & Knowledge Search

You can query technical guides and training videos directly in WhatsApp:

1. Tap **`🔍 Troubleshoot`** or type any natural language technical question:
   ```
   How do I calibrate Lactogrand sensor channels?
   ```
2. The AI matches your query with training videos and step-by-step guides:
   ```
   🎬 Found relevant training video:
   "Lactogrand Channel Calibration Procedure"
   👉 https://youtu.be/example_link
   ```

> 🔒 *R&D videos sent during troubleshooting are confidential. Do not forward them to customers.*

---

## 7. WhatsApp Quick Command Summary

| Action | Text Command Example | Interactive Button Alternative |
|---|---|---|
| Open Main Menu | `MENU` / `HI` | — |
| View Active Tickets | `TICKETS` | Tap **My Tickets** |
| Ticket Status Summary | `STATUS` | — |
| Start Work | `START TKT-XXXX` | Tap **Start Work** |
| Product Arrival Photo | *Send photo on WhatsApp* | — |
| Diagnosis Note | `DIAGNOSE TKT-XXXX <text>` | Tap **Service Report** ➔ **Diagnose** |
| Work Done Note | `NOTE TKT-XXXX <text>` | Tap **Service Report** ➔ **Work Done** |
| Warranty Selection | — | Tap **Yes, Warranty** / **No Warranty** |
| Add Replaced Part | `PART TKT-XXXX Name \| Part# \| Qty` | — |
| Finished Work Photo | *Send photo on WhatsApp* | — |
| Request Customer OTP | `OTP TKT-XXXX` | Tap **Request OTP** |
| Resend Customer OTP | `RESEND TKT-XXXX` | Tap **Resend OTP** |
| Enter & Verify OTP | `7453` or `VERIFY TKT-XXXX 7453` | Reply with 4 digits |
| Quick Test Close | `TESTCLOSE TKT-XXXX` | Tap **Test Close** |
| Technical Help | `HELP` | Tap **Help** |

---

## Important Engineer Guidelines

- ✅ **Always upload arrival photo** as soon as you reach the machine.
- ✅ **Complete work notes** (Diagnose & Work Done) before attempting to request OTP.
- ✅ **Always upload finished photo** showing the machine operating normally.
- ✅ **Never ask for OTP** until repair is fully complete and verified with the customer.
- ⚠️ If customer OTP expires (30-minute validity), tap **`Resend OTP`**.

---

*[← Back to User Guides Index](./README.md)*
