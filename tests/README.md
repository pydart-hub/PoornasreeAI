# Automated & Simulation Test Suites

This directory serves as the test management hub for **PoornasreeAI**.

Automated test scenarios, end-to-end customer simulation scripts, and benchmark runners are managed through the TypeScript test harness in `api/scripts/`.

---

## 🧪 Available Test Scenarios

Run these tests from the `api/` directory using `npx ts-node`:

### 1. Complaint & Ticket Lifecycle
```bash
cd api
# Test standard complaint creation & auto-classification
npx ts-node scripts/test-complaint-scenario.ts

# Test ticket status inquiries and WhatsApp alerts
npx ts-node scripts/test-complaint-status-scenario.ts

# Test redesigned multi-intent complaint dialog
npx ts-node scripts/test-redesigned-complaint-flow.ts

# Test customer complaint skipping serial number
npx ts-node scripts/test-skip-serial-scenario.ts

# Comprehensive verification of all 20+ complaint edge cases
npx ts-node scripts/verify-all-complaints.ts
```

### 2. Multi-Machine Fleet & Registration
```bash
cd api
# Test customer with multiple machines & automated machine registration
npx ts-node scripts/test-multi-machine-and-auto-registration.ts

# Test existing customer returning workflow
npx ts-node scripts/test-existing-customer-flow.ts
```

### 3. Service Engineers & Onboarding
```bash
cd api
# Verify engineer error code lookups and technical queries
npx ts-node scripts/verify-engineer-queries.ts

# Test field engineer ticket checklist & OTP closure
npx ts-node scripts/test-engineer-flow.ts
```

### 4. RAG & Vector Chunk Matching
```bash
cd api
# Test Qdrant vector chunk matching for technical manuals
npx ts-node scripts/test-doc-chunk-matching.ts

# Benchmark chatbot response latency and LLM token usage
npx ts-node scripts/benchmark-chatbot-speed.ts
```

---

## 📋 Test Documentation
For the complete test matrix and simulation plan, refer to:
👉 **[docs/reports/SIMULATION_TEST_PLAN.md](../docs/reports/SIMULATION_TEST_PLAN.md)**
