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

## 🔑 User Credentials & Portal Access

All web dashboards share the unified login page at **`/login`**.

| Role Name | Role Key | Default Email | Default Password | Portal Route | Primary Function |
|---|---|---|---|---|---|
| 👑 **Super Admin** | `super_admin` | `superadmin@poornasree.com` | `SuperAdmin@1234` | `/super-admin` | Runtime settings, LLM keys, WhatsApp billing telemetry, logs |
| 🛡️ **System Administrator** | `admin` | `admin@poornasree.com` | `Admin@1234` | `/admin` | Master users, products, training videos, documents, templates |
| 📋 **Service Manager** | `service_manager` | `manager@poornasree.com` | `Manager@1234` | `/service-manager` | Pincode dispatch, SLA tracking, engineer reassignments |
| 🗂️ **Asst. Service Manager** | `assistant_service_manager` | `assistant_manager@poornasree.com` | `Assistant@1234` | `/assistant-manager` | Ticket queue oversight and delegated approvals |
| 🔧 **Service Engineer** | `service_engineer` | `engineer1@poornasree.com`<br/>`engineer2@poornasree.com`<br/>`engineer3@poornasree.com` | `Engineer@1234` | `/service` | Field ticket checklist, on-site OTP signoff, work reports |
| 🏬 **Authorized Dealer** | `dealer` | `dealer@poornasree.com` | `Dealer@1234` | `/dealer` | Machine registration, warranty claim requests, reports |
| 🎧 **Customer Support** | `customer_support` | `support@poornasree.com` | `Support@1234` | `/support-dashboard` | Live chat takeover, WhatsApp bot pause/resume |
| 💬 **Customer Service** | `customer_service` | `customerservice@poornasree.com` | `Service@1234` | `/customer-service` | General customer service tickets and complaints |
| 💼 **Sales Representative** | `sales` | `sales@poornasree.com` | `Sales@1234` | `/sales` | Quotations, machine inquiries, lead management |
| 📢 **Marketing Specialist** | `marketing` | `marketing@poornasree.com` | `Marketing@1234` | `/marketing` | WhatsApp broadcast promotions, campaigns |
| 👤 **End Customer** | `customer` | `customer@example.com` | `Customer@123` | `/dashboard` | Machine registry overview (Primary: WhatsApp bot) |

---

## Role-to-Guide Quick Finder

| 👤 Who are you? | 📄 Your Guide | Portal Link |
|---|---|---|
| 👑 **Super Admin** | [SUPER_ADMIN_GUIDE.md](./SUPER_ADMIN_GUIDE.md) | `/super-admin` |
| ⚙️ **System Administrator** | [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) | `/admin` |
| 📋 **Service Manager / Assistant Manager** | [SERVICE_MANAGER_GUIDE.md](./SERVICE_MANAGER_GUIDE.md) | `/service-manager` · `/assistant-manager` |
| 🔧 **Field Service Engineer** | [SERVICE_ENGINEER_GUIDE.md](./SERVICE_ENGINEER_GUIDE.md) | `/service` |
| 🏬 **Authorized Dealer / Partner** | [DEALER_GUIDE.md](./DEALER_GUIDE.md) | `/dealer` |
| 🎧 **Customer Support & Service** | [CUSTOMER_SUPPORT_GUIDE.md](./CUSTOMER_SUPPORT_GUIDE.md) | `/support-dashboard` · `/customer-service` |
| 💼 **Sales & Marketing Team** | [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) | `/sales` · `/marketing` |
| 🛒 **Customer / End User** | [CUSTOMER_GUIDE.md](./CUSTOMER_GUIDE.md) | WhatsApp `+91 94009 61291` |

---

## Role Permissions Matrix

| Feature / Access | Customer | Engineer | Manager | Support | Dealer | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| WhatsApp AI Chat | ✅ | ✅ | — | — | — | — | — |
| Self-service Troubleshooting | ✅ | — | — | — | — | — | — |
| Raise Service Ticket (WhatsApp) | ✅ | — | ✅ | — | ✅ | — | — |
| OTP Verification (site closure) | ✅ | ✅ | — | — | ✅ | — | — |
| Engineer Dashboard (`/service`) | — | ✅ | — | — | — | — | — |
| Service Manager Dashboard | — | — | ✅ | — | — | — | — |
| Customer Support Dashboard | — | — | — | ✅ | — | ✅ | ✅ |
| Dealer Portal (`/dealer`) | — | — | — | — | ✅ | — | — |
| Admin Portal (`/admin`) | — | — | — | — | — | ✅ | ✅ |
| Super Admin Portal (`/super-admin`) | — | — | — | — | — | — | ✅ |
| Assign Engineers / Dealers | — | — | ✅ | — | — | — | — |
| Accept / Reject Dealer Tickets | — | — | — | — | ✅ | — | — |
| Live Chat Takeover (Bot Pause) | — | — | — | ✅ | — | ✅ | ✅ |
| View Work Reports (Engineer Updates) | — | — | ✅ | — | — | — | — |
| Engineer Feedback / Ratings View | — | — | ✅ | — | — | — | — |
| Upload AI Documents | — | — | — | — | — | ✅ | ✅ |
| Manage Users & Roles | — | — | — | — | — | ✅ | ✅ |
| Manage Products | — | — | — | — | — | ✅ | ✅ |
| Upload Training Videos | — | — | — | — | — | ✅ | ✅ |
| Upload R&D Videos | — | — | — | — | — | ✅ | ✅ |
| View R&D Videos | — | ✅ | — | — | — | ✅ | ✅ |
| Runtime Settings & LLM API Keys | — | — | — | — | — | — | ✅ |
| Telemetry & WhatsApp Billing Logs | — | — | — | — | — | — | ✅ |
| Analytics & Reporting | — | — | ✅ | — | — | ✅ | ✅ |


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
