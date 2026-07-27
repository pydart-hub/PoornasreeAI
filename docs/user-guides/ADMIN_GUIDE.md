# System Administrator Guide — PoornasreeAI

> **For**: System Administrators with full platform access  
> **Access**: Admin Portal (`/admin`) and Users sub-page (`/admin/users`)  
> **Role in System**: `admin`

---

## Introduction

As a **System Administrator**, you have the highest level of access on the PoornasreeAI platform. You manage users, AI training documents, product information, support tickets, videos for engineers, and the WhatsApp bot configuration.

> ⚠️ **Admin actions are irreversible in some cases** (e.g., deleting users or documents). Always confirm before destructive operations.

---

## Accessing the Admin Portal

| URL | Purpose |
|---|---|
| `/admin` | Main admin dashboard |
| `/admin/users` | Create and manage all users |

Login with your admin email and password.

---

## Admin Sidebar Navigation

When you log in, you see these sections in the left sidebar under **Manage**:

| Section | What It Does |
|---|---|
| **Overview** | Summary stat cards: Documents, Trained docs, Users, Conversations |
| **Documents** | Upload AI training documents; view Manual Complaints |
| **Users** | View all users; navigate to `/admin/users` to create or manage |
| **Videos** | Manage customer-facing YouTube video resources |
| **Eng. Videos** | Manage R&D videos for engineers (R&D tab) |
| **Tickets** | View and manage all service tickets across the platform |
| **Products** | Manage the product catalog shown to customers on WhatsApp |
| **WhatsApp** | Configure WhatsApp bot settings |
| **Analytics** | View platform-wide usage analytics |
| **Training Videos** | Manage engineer self-learning training videos |

---

## 1. Overview

The top banner shows 4 stat cards at a glance:
- **Documents** — Total uploaded documents
- **Trained** — Number of documents that have been embedded and are active for AI responses
- **Manage Users** — Clickable card showing total user count; opens `/admin/users`
- **Conversations** — Total AI chat conversations across all users

---

## 2. Documents

The **Documents** tab is the core of AI training. Documents you upload here are automatically embedded (chunked and vectorized) and power the AI chatbot's responses to customers and engineers.

### Uploading a Document

1. Select the document type:
   - 🔧 **Service** — Technical documents for service engineers (troubleshooting, procedures)
   - 👤 **Customer** — Product info, user manuals, FAQs shown to customers

2. Click the **upload area** or **drag and drop** a file

   Supported formats: **PDF, JSON, CSV, TXT, DOCX, XLSX** (max 50 MB)

3. The system automatically:
   - Parses the document
   - Splits it into chunks
   - Embeds it for AI retrieval

4. Status shows as **Pending** → changes to ✅ **Trained** once processing is complete

### Managing Documents

Each document in the list shows:
- **Title** — Filename used as document title
- **Upload date** and who uploaded it
- **Chunk count** — How many AI-readable chunks were extracted
- **Document type** — Service 🔧 or Customer 👤
- **Status** — `Trained` (active) or `Pending` (still processing)

**Actions:**
- 🗑️ **Delete** — Permanently removes the document and its AI chunks
- ✏️ **Live Edit** (Excel files only) — Opens an in-dashboard spreadsheet editor to modify `.xlsx` files

### Manual Complaints (at the bottom of Documents tab)

Below the document list is the **Manual Complaints** section. These are free-text complaints that customers typed in the WhatsApp "Other" option during troubleshooting. They appear here for admin review.

You can:
- View the customer's exact complaint text and machine name
- Mark as reviewed
- Add them to documents for future AI training

---

## 3. Users

Click **Users** in the sidebar to see all registered users. From here you can:

- **Search** users by name, email, or role
- See each user's role badge, email, join date, and conversation count
- **Delete** a user (except yourself) — ⚠️ cannot be undone

Click **"Create User"** or navigate to `/admin/users` to create new accounts.

### User Roles

| Role | Dashboard Access |
|---|---|
| `customer` | WhatsApp bot only |
| `service_engineer` | `/service` |
| `service_manager` | `/service-manager` |
| `assistant_service_manager` | `/assistant-manager` |
| `customer_support` | `/support-dashboard` |
| `dealer` | `/dealer` |
| `admin` | `/admin` (full access) |

### Creating a New User

At `/admin/users`, fill in:
- First Name, Last Name
- Email (used as login username)
- Role
- WhatsApp Number (for engineers and dealers — format: `919876543210`)

After creation, the user receives a **set-password link** via email (valid 7 days).

---

## 4. Videos (Customer-Facing)

These are YouTube video resources linked to keywords. The WhatsApp AI bot matches customer questions to these videos and recommends them in chat.

### Adding a Video

Click **"Add Video"** and fill in:

| Field | Description |
|---|---|
| **Title** | Descriptive name (e.g., "Lactosure Calibration Guide") |
| **Description** | What the video covers (optional) |
| **YouTube URL** | Full YouTube link |
| **Keywords** | Comma-separated keywords (e.g., `calibration, lactosure, zero`) |

Click **Save**. The bot uses keywords to match and recommend this video when customers ask related questions.

### Editing / Deleting

- Click ✏️ **Edit** to modify any field
- Click 🗑️ **Delete** to permanently remove the video

---

## 5. Eng. Videos (R&D / Engineer Confidential)

These are **confidential technical videos** visible only to `service_engineer` and `admin` roles. They are sent automatically to engineers during troubleshooting when a customer complaint matches the video's keywords.

> 🔒 These videos should use **unlisted or private YouTube URLs** to prevent public access.

### Adding an R&D Video

Click **"Add Eng. Video"** and fill in:

| Field | Description |
|---|---|
| **Title** | Technical name (e.g., "E4 Error — Sensor Board Fix") |
| **Description** | Brief explanation |
| **YouTube URL** | YouTube link (use unlisted for confidentiality) |
| **Keywords** | Comma-separated matching keywords |

---

## 6. Tickets

The **Tickets** tab gives you admin-level visibility into all service tickets on the platform.

You can view, filter, and search tickets across all statuses:

| Status | Meaning |
|---|---|
| **OPEN** | Customer raised a ticket; not yet assigned |
| **ASSIGNED** | Assigned to an engineer or dealer |
| **IN_PROGRESS** | Field work actively ongoing |
| **PENDING_OTP** | Job done; waiting for customer OTP confirmation |
| **CLOSED** | Ticket resolved and closed |

Click any ticket to open its full detail view.

---

## 7. Products

The **Products** tab manages the product catalog that customers can browse on WhatsApp when they choose "View Our Products".

### Adding a Product

Click **"Add Product"** and fill in:

| Field | Description |
|---|---|
| **Name** | Product name |
| **Category** | `lactosure` / `lactogrand` / `other` |
| **Detail** | Full description |
| **Price** | Price text (e.g., `₹45,000/-`) |
| **Image URL** | Product image path or URL |
| **Contact Number** | Sales number shown on WhatsApp |
| **Display Order** | Order products appear (lower = first) |
| **Active** | Only active products are shown to customers |

### Editing / Deactivating Products

- **Edit**: Modify any product field
- **Deactivate**: Uncheck the Active toggle to hide from customers without deleting

---

## 8. WhatsApp (Bot Settings)

The **WhatsApp** tab controls the chatbot's customer-facing configuration.

You can configure:

| Setting | Purpose |
|---|---|
| **Support Phone** | Phone number shown to customers when they request to speak to a human |
| **Support Email** | Contact email displayed in bot responses (if configured) |
| **Support Hours** | Business hours text (e.g., `Mon–Sat, 9 AM – 6 PM`) |
| **Support Note** | Additional message shown in the support handoff menu |

After changing any setting, click **Save**.

---

## 9. Analytics

The **Analytics** tab provides platform-wide usage insights.

### Views

Switch between three views:

| View | What It Shows |
|---|---|
| **Overview** | Total conversations, support requests, escalation rate, AI resolution rate, resolved/pending/active counts, top machines, recent issues, activity timeline chart |
| **Customer** | Customer-specific stats: top complaints, top questions, conversation timeline, recent issues |
| **Service** | Engineer/service stats: top machines, top topics, resolved/pending/active by service conversations |

Charts displayed: Line chart (conversation timeline), Bar chart (machines), Pie chart (support status breakdown).

---

## 10. Training Videos

**Training Videos** are educational YouTube videos for **service engineers**. Engineers can discover these by asking the WhatsApp bot in natural language (e.g., "How do I set up the Wi-Fi?").

> Unlike R&D Videos (which are automatically sent during troubleshooting), training videos are retrieved only when engineers ask a related free-text question.

### Adding a Training Video

Click **"Add Training Video"** and fill in:

| Field | Description |
|---|---|
| **Title** | Video title |
| **Description** | What the video covers |
| **YouTube URL** | YouTube link |
| **Topic** | Topic tags for matching (e.g., `calibration, channel settings, wifi, cloud setup`) |

---

## Frequently Asked Questions

### Q: How do I reset a user's password?
**A:** Go to `/admin/users` → Find the user → Click **"Resend Setup Link"**. A new password-set link is sent to their email.

### Q: My document says "Pending" for a long time — what do I do?
**A:** Check the server logs. If the background embedding service is down, it may not process. Contact the technical team.

### Q: Can I edit a document's content after uploading?
**A:** For Excel (.xlsx) files, yes — use the ✏️ Live Edit button. For PDFs and other formats, delete and re-upload the corrected version.

### Q: How are R&D videos different from Training Videos?
**A:** R&D Videos are sent **automatically** when a customer's troubleshooting complaint matches keywords. Training Videos are only shared when an **engineer asks** a related question via WhatsApp.

### Q: Can I see individual customer conversations?
**A:** Yes — use the **Customer Support** dashboard (`/support-dashboard`, also accessible to admins) to view and interact with live WhatsApp sessions.

---

*[← Back to User Guides Index](./README.md)*
