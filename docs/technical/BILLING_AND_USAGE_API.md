# PoornasreeAI — Live Groq Token Usage & WhatsApp Billing API Reference

> **Audience**: Engineering Leadership, Product Leads, Finance & Billing Audits  
> **Base URL (Production)**: `https://ai.poornasreecloud.com`  
> **Base URL (Local Development)**: `http://localhost:3000` (or `http://localhost:4002` / `http://localhost:4000`)  
> **Protocol**: HTTPS  
> **Authentication**: None required for `/api/public/*` endpoints (read-only live inspection)  
> **Format**: JSON (`application/json`)  

---

## 1. Quick Endpoints Cheatsheet

| Purpose | Public Endpoint (Direct Share) | Authenticated Admin Route |
| :--- | :--- | :--- |
| **Groq LLM Token Usage & Cost** | `GET /api/public/groq-usage` | `GET /api/admin/analytics/groq-usage` |
| **WhatsApp Messages Delivery Status & Billing** | `GET /api/public/whatsapp-billing` | `GET /api/admin/whatsapp/billing` |
| **WhatsApp Messages Audit Log** | `GET /api/public/whatsapp-messages` | `GET /api/admin/whatsapp/messages` |

---

## 2. Groq LLM Token Usage & Cost Endpoint

Live telemetry aggregating every Groq API inference call in real time, calculating prompt tokens, completion tokens, request volumes, model breakdowns, and estimated billing costs.

```http
GET /api/public/groq-usage
```

### 2.1 Query Parameters

| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `from` or `startDate` | string | Optional | Filter start date (`YYYY-MM-DD` or ISO 8601) | `?from=2026-09-01` |
| `to` or `endDate` | string | Optional | Filter end date (`YYYY-MM-DD` or ISO 8601) | `?to=2026-09-09` |
| `period` | string | Optional | Pre-set time shortcut (`today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `all`) | `?period=this_month` |
| `model` | string | Optional | Filter by specific model name | `?model=llama-3.3-70b-versatile` |
| `feature` | string | Optional | Filter by application feature (`whatsapp_bot`, `engineer_qa`, `whisper_stt`) | `?feature=whatsapp_bot` |
| `page` | number | Optional | Page number for recent request logs (default: `1`) | `?page=1` |
| `limit` | number | Optional | Number of items per page (default: `50`, max: `200`) | `?limit=50` |

### 2.2 Billing Rates Applied

- **Conversion Rate**: 1 USD = ₹86.5 INR
- **Groq Official Cloud Pricing**:
  - `llama-3.3-70b-versatile`: $0.59 / 1M prompt tokens, $0.79 / 1M completion tokens
  - `llama-3.1-70b-versatile`: $0.59 / 1M prompt tokens, $0.79 / 1M completion tokens
  - `llama-3.1-8b-instant`: $0.05 / 1M prompt tokens, $0.08 / 1M completion tokens
  - `whisper-large-v3-turbo`: $0.04 / hour (~$0.0002 per short audio note)
  - Default / Fallback: $0.59 / 1M prompt, $0.79 / 1M completion

### 2.3 Ready-to-Test URLs

- **Live All-Time Usage**:  
  `https://ai.poornasreecloud.com/api/public/groq-usage`
- **Current Month (September 2026)**:  
  `https://ai.poornasreecloud.com/api/public/groq-usage?period=this_month`
- **Today's Live Requests**:  
  `https://ai.poornasreecloud.com/api/public/groq-usage?period=today`
- **Custom Billing Cycle**:  
  `https://ai.poornasreecloud.com/api/public/groq-usage?from=2026-09-01&to=2026-09-09`

### 2.4 Sample JSON Response

```json
{
  "status": "success",
  "live": true,
  "queriedAt": "2026-09-09T05:53:31.213Z",
  "filter": {
    "period": "custom",
    "startDate": "2026-09-01T00:00:00.000Z",
    "endDate": "2026-09-09T23:59:59.999Z",
    "model": "all",
    "feature": "all"
  },
  "billingSummary": {
    "totalTokens": 142580,
    "promptTokens": 92350,
    "completionTokens": 50230,
    "totalRequests": 128,
    "averageTokensPerRequest": 1113,
    "averageDurationMs": 842,
    "estimatedCost": {
      "usd": 0.0941,
      "formattedUsd": "$0.0941",
      "inr": 8.14,
      "formattedInr": "₹8.14",
      "exchangeRateUsdToInr": 86.5
    }
  },
  "quickBenchmarks": {
    "today": { "tokens": 14200, "requests": 15 },
    "thisWeek": { "tokens": 68400, "requests": 62 },
    "thisMonth": { "tokens": 142580, "requests": 128 },
    "allTime": { "tokens": 256800, "requests": 218 }
  },
  "dailyBreakdown": [
    {
      "date": "2026-09-09",
      "requests": 15,
      "totalTokens": 14200,
      "promptTokens": 9100,
      "completionTokens": 5100,
      "costUsd": 0.0094,
      "costInr": 0.81,
      "formattedCostUsd": "$0.0094",
      "formattedCostInr": "₹0.81"
    }
  ],
  "breakdownByModel": [
    {
      "model": "llama-3.3-70b-versatile",
      "requests": 115,
      "totalTokens": 138000,
      "promptTokens": 89000,
      "completionTokens": 49000,
      "estimatedCostUsd": 0.0912,
      "formattedCostUsd": "$0.0912",
      "estimatedCostInr": 7.89,
      "formattedCostInr": "₹7.89"
    }
  ],
  "breakdownByFeature": [
    {
      "feature": "whatsapp_bot",
      "requests": 95,
      "totalTokens": 112000,
      "promptTokens": 72000,
      "completionTokens": 40000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 128,
    "totalPages": 3
  },
  "recentRequests": [ ... ]
}
```

---

## 3. WhatsApp Messages Delivery Status & Billing Endpoint

Live accounting of all outbound WhatsApp messages sent to customers, engineers, and dealers, categorized by Meta conversation type, with live delivery status receipts (`sent`, `delivered`, `read`, `failed`) and Meta Cloud API cost calculation.

```http
GET /api/public/whatsapp-billing
```

### 3.1 Query Parameters

| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `from` or `startDate` | string | Optional | Filter start date (`YYYY-MM-DD` or ISO 8601) | `?from=2026-09-01` |
| `to` or `endDate` | string | Optional | Filter end date (`YYYY-MM-DD` or ISO 8601) | `?to=2026-09-09` |
| `period` | string | Optional | Pre-set time shortcut (`today`, `yesterday`, `this_week`, `this_month`, `all`) | `?period=this_month` |
| `status` | string | Optional | Filter by delivery receipt (`sent`, `delivered`, `read`, `failed`) | `?status=delivered` |
| `category` | string | Optional | Filter by category (`utility`, `marketing`, `service`, `authentication`) | `?category=utility` |
| `phone` | string | Optional | Search by recipient phone number | `?phone=919400961291` |
| `page` | number | Optional | Page number for recent logs (default: `1`) | `?page=1` |
| `limit` | number | Optional | Items per page (default: `50`, max: `200`) | `?limit=50` |

### 3.2 Meta WhatsApp Cloud API Billing Rates (India Tier)

| Category | Cost in INR | Cost in USD | Description |
| :--- | :--- | :--- | :--- |
| **Marketing** | **₹0.88** | ~$0.0102 | Promotional broadcasts, campaigns, branding outreach |
| **Utility** | **₹0.12** | ~$0.0014 | Ticket notifications, engineer assignments, status alerts |
| **Service** | **₹0.35** | ~$0.0040 | Customer support & troubleshooting chatbot conversations (24-hour customer service window) |
| **Authentication** | **₹0.12** | ~$0.0014 | One-time password (OTP) verification codes |

### 3.3 Ready-to-Test URLs

- **Live All-Time Summary**:  
  `https://ai.poornasreecloud.com/api/public/whatsapp-billing`
- **Current Month Billing (September 2026)**:  
  `https://ai.poornasreecloud.com/api/public/whatsapp-billing?period=this_month`
- **Custom Billing Cycle**:  
  `https://ai.poornasreecloud.com/api/public/whatsapp-billing?from=2026-09-01&to=2026-09-09`
- **Delivered Messages Only**:  
  `https://ai.poornasreecloud.com/api/public/whatsapp-billing?status=delivered`
- **Utility / Ticket Alerts Category Only**:  
  `https://ai.poornasreecloud.com/api/public/whatsapp-billing?category=utility`

### 3.4 Live Production JSON Response

```json
{
  "status": "success",
  "live": true,
  "queriedAt": "2026-09-09T05:52:34.005Z",
  "filter": {
    "period": "all_time",
    "startDate": null,
    "endDate": null,
    "status": "all",
    "category": "all",
    "phone": null
  },
  "billingSummary": {
    "totalMessagesSent": 374,
    "totalAmountInr": 130.90,
    "formattedAmountInr": "₹130.90",
    "totalAmountUsd": 1.513,
    "formattedAmountUsd": "$1.513",
    "unitRatesAppliedInr": {
      "marketingPerMessage": "₹0.88",
      "utilityPerMessage": "₹0.12",
      "servicePerConversation": "₹0.35",
      "authenticationPerMessage": "₹0.12"
    }
  },
  "deliveryStatusSummary": {
    "totalSent": 374,
    "delivered": 355,
    "read": 292,
    "failed": 19,
    "deliverySuccessRate": "94.9%",
    "readRate": "78.1%",
    "failureRate": "5.1%"
  },
  "categoryBreakdown": [
    {
      "category": "service",
      "description": "Customer Support & Troubleshooting Chatbot Sessions",
      "count": 374,
      "rateInr": 0.35,
      "subtotalInr": 130.90,
      "formattedSubtotalInr": "₹130.90"
    },
    {
      "category": "utility",
      "description": "Ticket Notifications, Engineer Alerts & Status Updates",
      "count": 0,
      "rateInr": 0.12,
      "subtotalInr": 0.00,
      "formattedSubtotalInr": "₹0.00"
    },
    {
      "category": "marketing",
      "description": "Promotional Broadcasts & Campaigns",
      "count": 0,
      "rateInr": 0.88,
      "subtotalInr": 0.00,
      "formattedSubtotalInr": "₹0.00"
    }
  ],
  "dailyBillingTrend": [
    {
      "date": "2026-09-06",
      "messagesSent": 45,
      "delivered": 43,
      "read": 38,
      "failed": 2,
      "amountInr": 15.75,
      "amountUsd": 0.182,
      "formattedInr": "₹15.75",
      "formattedUsd": "$0.1820"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 374,
    "totalPages": 8
  },
  "messages": [
    {
      "id": "0d9c881c-63a7-4203-af14-573cc08f7758",
      "recipientPhone": "917309382973",
      "direction": "outbound",
      "messageType": "text",
      "templateName": null,
      "category": "service",
      "status": "delivered",
      "costInr": 0.35,
      "costUsd": 0.004,
      "contentPreview": "🌐 *Select your preferred language:*\n\nChoose your language to continue 👇",
      "createdAt": "2026-09-06T06:32:06.812Z"
    }
  ]
}
```

---

## 4. Message Log Audit Endpoint

For customer support managers and QA leads needing to search and inspect raw sent/received message content.

```http
GET /api/public/whatsapp-messages
```

### 4.1 Query Parameters
- `phone`: Recipient phone search (e.g. `?phone=917309382973`)
- `role`: `user` (inbound from customer) | `bot` (outbound from Hari/bot) | `system` (alerts/audit logs)
- `from` / `to`: Date filtering
- `page` / `limit`: Pagination controls

---

## 5. Summary Template to Send to Your Lead

```text
Hi Lead,

Here is the live billing and telemetry API reference for our Poornasree AI platform:

1. Groq LLM Token Usage & Cost Analytics:
URL: https://ai.poornasreecloud.com/api/public/groq-usage
- With Date Filtering: https://ai.poornasreecloud.com/api/public/groq-usage?from=2026-09-01&to=2026-09-09
- Presets: ?period=this_month | today | this_week | all
- What it returns: Total tokens (prompt + completion), request count, model breakdown, daily usage curve, and calculated cost in USD ($) and INR (₹).

2. WhatsApp Outbound Message Delivery & Billing:
URL: https://ai.poornasreecloud.com/api/public/whatsapp-billing
- With Date Filtering: https://ai.poornasreecloud.com/api/public/whatsapp-billing?from=2026-09-01&to=2026-09-09
- Filter by Delivery Status: ?status=delivered | read | failed
- Filter by Category: ?category=utility | marketing | service
- What it returns: Total messages sent, live delivery success rate %, read rate %, breakdown by Meta category (Marketing ₹0.88, Utility ₹0.12, Service ₹0.35), daily billing trend, and total amount in INR (₹) and USD ($).

Both endpoints are live and require no login session. Full documentation is saved in docs/BILLING_AND_USAGE_API.md.
```
