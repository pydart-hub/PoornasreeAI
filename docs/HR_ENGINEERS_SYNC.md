# HR Engineers roster sync

Poornasree mirrors technicians from the external HR app into local `User` rows (`role: service_engineer`) so existing ticket assignment, login, and field-work flows stay unchanged.

## External source

- **URL (default):** `http://145.223.18.143/hr_api_v2/public/engineers`
- **Included roles:** `technician` only (HR `admin` entries are ignored)
- **Response shape:** `{ success, data: [{ id, name, role, ph_number, area_pin }], count }`

## Environment variables (API `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `HR_ENGINEERS_URL` | No | Override roster endpoint URL |
| `HR_SYNC_MANAGER_ID` | No | UUID of the `service_manager` who owns synced engineers. If empty, the first `service_manager` in the database is used |

## When sync runs

Sync is triggered (non-blocking on failure) when:

- `GET /api/manager/engineers`
- `GET /api/tickets/engineers`

HR data is cached in memory for 5 minutes between HTTP calls.

## Field mapping

| HR | Poornasree `User` |
|----|-------------------|
| `id` | `hrEngineerId` (unique) |
| `name` | `firstName`, `lastName` |
| `ph_number` | `whatsappNumber` |
| `area_pin` | `engineerPincodes` (if `Pincode.code` exists) |
| — | `email`: `hr-{id}@sync.poornasree.local` |
| — | `managerId`: configured service manager |

## API response fields

Engineer list items may include:

- `source`: `"hr"` | `"local"`
- `hrEngineerId`: number when synced from HR
- `syncWarning`: present on `GET /api/manager/engineers` if the HR API was unreachable (last synced rows still returned)

## Manager rules

- **Delete:** HR-synced engineers cannot be deleted from Poornasree (`403`). Remove them in the HR app.
- **Email:** Cannot be changed for HR-synced engineers.
- **Setup link:** `POST /api/manager/engineers/:id/resend-setup-link` works for HR engineers (same as local).
- **Pincodes:** `PATCH /api/manager/engineers/:id/pincodes` works for HR engineers.
- **Assistants:** May assign HR engineers owned by their parent service manager (pincode rules unchanged).

## Database migration

Apply:

```sql
ALTER TABLE "User" ADD COLUMN "hrEngineerId" INTEGER,
ADD COLUMN "hrSyncedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_hrEngineerId_key" ON "User"("hrEngineerId");
```

Or run `npx prisma migrate deploy` from `PoornasreeAI/api`.

## Manual engineers

Engineers created via `POST /api/manager/engineers` or xlsx import have `hrEngineerId = null` and `source: "local"`. Both types appear in the same team list.
