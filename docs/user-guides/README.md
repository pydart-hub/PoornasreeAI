# PoornasreeAI — User Guides Hub

> **Platform**: PoornasreeAI — WhatsApp-driven AI service management platform for Poornasree Equipments.  
> **Support Line**: WhatsApp **+91 94009 61291**  
> **Version**: v1.0 · Last Updated: July 2026

---

## What is PoornasreeAI?

PoornasreeAI is an AI-powered service management platform that allows customers to:
- Chat with an AI assistant via **WhatsApp**
- Troubleshoot their Poornasree equipment problems
- Raise service tickets automatically
- Get an engineer dispatched to their location

Behind the scenes, it gives the **Poornasree internal team** a full web dashboard to manage tickets, engineers, dealers, and customer communications — all in one place.

---

## Platform Architecture (Quick Snapshot)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Customer (WhatsApp)                          │
│   Sends message → AI processes → Troubleshoot / Raise Ticket        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  WhatsApp API (Meta Cloud)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PoornasreeAI Backend (Express + Prisma API)             │
│   Webhook → AI Engine (Groq LLM) → Ticket Engine → Notifications    │
└──────┬───────────────────┬─────────────────────────────┬────────────┘
       │                   │                             │
       ▼                   ▼                             ▼
 PostgreSQL DB      Next.js Web Dashboards         WhatsApp Alerts
 (All data)         (Admin, Manager, Support,      (Engineers, Dealers,
                    Dealer, Engineer portals)       Customers)
```

---

## Role-to-Guide Quick Finder

| 👤 Who are you? | 📄 Your Guide |
|---|---|
| 🛒 **Customer / End User** | [CUSTOMER_GUIDE.md](./CUSTOMER_GUIDE.md) |
| 🔧 **Field Service Engineer** | [SERVICE_ENGINEER_GUIDE.md](./SERVICE_ENGINEER_GUIDE.md) |
| 📋 **Service Manager / Assistant Manager** | [SERVICE_MANAGER_GUIDE.md](./SERVICE_MANAGER_GUIDE.md) |
| 🎧 **Customer Support Agent** | [CUSTOMER_SUPPORT_GUIDE.md](./CUSTOMER_SUPPORT_GUIDE.md) |
| 🏬 **Authorized Dealer / Partner** | [DEALER_GUIDE.md](./DEALER_GUIDE.md) |
| ⚙️ **System Administrator** | [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) |

---

## Role Permissions Matrix

| Feature / Access | Customer | Engineer | Manager | Support | Dealer | Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| WhatsApp AI Chat | ✅ | ✅ | — | — | — | — |
| Self-service Troubleshooting | ✅ | — | — | — | — | — |
| Raise Service Ticket (WhatsApp) | ✅ | — | ✅ | — | ✅ | — |
| OTP Verification (site closure) | ✅ | ✅ | — | — | ✅ | — |
| Engineer Dashboard (`/service`) | — | ✅ | — | — | — | — |
| Service Manager Dashboard | — | — | ✅ | — | — | — |
| Customer Support Dashboard | — | — | — | ✅ | — | ✅ |
| Dealer Portal (`/dealer`) | — | — | — | — | ✅ | — |
| Admin Portal (`/admin`) | — | — | — | — | — | ✅ |
| Assign Engineers / Dealers | — | — | ✅ | — | — | — |
| Accept / Reject Dealer Tickets | — | — | — | — | ✅ | — |
| Live Chat Takeover (Bot Pause) | — | — | — | ✅ | — | ✅ |
| View Work Reports (Engineer Updates) | — | — | ✅ | — | — | — |
| Engineer Feedback / Ratings View | — | — | ✅ | — | — | — |
| Upload AI Documents | — | — | — | — | — | ✅ |
| Manage Users | — | — | — | — | — | ✅ |
| Manage Products | — | — | — | — | — | ✅ |
| Upload Training Videos | — | — | — | — | — | ✅ |
| Upload R&D Videos | — | — | — | — | — | ✅ |
| View R&D Videos | — | ✅ | — | — | — | ✅ |
| WhatsApp Bot Settings | — | — | — | — | — | ✅ |
| Analytics | — | — | — | — | — | ✅ |


---

## Key Concepts Glossary

| Term | Meaning |
|---|---|
| **Ticket** | A formal service request raised when a customer has an equipment problem |
| **Pincode Routing** | Automatic assignment of engineers/dealers based on customer's ZIP/Pincode |
| **OTP** | 4-digit One-Time Password sent to customer. Engineer must enter this on-site to close a ticket |
| **Passtest API** | External system that holds machine warranty/invoice data (serial number look-up) |
| **Bot Pause** | When customer support takes over a live chat, the AI bot is paused |
| **Work Report** | Field report submitted by dealer: parts replaced, work done, warranty claim |
| **R&D Video** | Confidential technical video shared with engineers during WhatsApp troubleshooting |
| **Training Video** | Internal training videos for engineers, discoverable via WhatsApp free-text query |

---

## Ticket Lifecycle (Universal Reference)

```
     Customer Raises Issue (WhatsApp / Dashboard)
                    │
                    ▼
              ┌──────────┐
              │   OPEN   │  ← Ticket created, unassigned
              └────┬─────┘
                   │  Manager assigns engineer / dealer
                   ▼
            ┌──────────────┐
            │   ASSIGNED   │  ← Engineer/Dealer notified via WhatsApp
            └──────┬───────┘
                   │  Engineer acknowledges / begins work
                   ▼
           ┌──────────────────┐
           │   IN_PROGRESS    │  ← Active field work
           └──────┬───────────┘
                  │  Job done — OTP sent to customer
                  ▼
          ┌─────────────────────┐
          │    PENDING_OTP      │  ← Awaiting customer OTP confirmation
          └──────────┬──────────┘
                     │  Customer shares OTP with engineer on-site
                     ▼
               ┌──────────┐
               │  CLOSED  │  ← Ticket complete, feedback collected
               └──────────┘
```

---

## Support & Contact

| Role | Contact |
|---|---|
| Customer queries | WhatsApp **+91 94009 61291** |
| Admin / IT issues | Contact your System Administrator |
| Engineer setup | Contact your Service Manager |

---

*For contribution or corrections to these guides, speak to the System Administrator.*
