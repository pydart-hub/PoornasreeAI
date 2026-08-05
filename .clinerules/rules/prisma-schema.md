# Rule: Prisma schema — evolving safely

> Schema: `api/prisma/schema.prisma` (564 lines, ~30 models).
> Migration history: `api/prisma/migrations/` (immutable).

## Mental model

- `User` is the only auth-bearing entity. Role is a `String` (not an
  enum) for forward compatibility.
- `Ticket` is the active business entity. `TicketStatus` and
  `TicketOwnerType` are enums.
- `Pincode` is the routing primitive — engineers ↔ pincodes is
  many-to-many via `User.engineerPincodes` (`@relation("EngineerPincodes")`).
- `DocumentChunk` holds vector IDs for Qdrant (`vectorId: String`).
- `SystemSetting` is the super-admin configurable KV store with
  optional AES-GCM-encrypted secrets (`isSecret: Boolean`).
- Legacy: `Conversation`, `Message`, `SupportRequest`, `SupportMessage`,
  `ConversationSession`. **Frozen — do not add fields.**

## To add a new field

1. Edit `api/prisma/schema.prisma`.
2. Local dev:
   ```bash
   cd api
   npx prisma migrate dev --name <short_slug>
   ```
   This creates `api/prisma/migrations/<timestamp>_<slug>/migration.sql`
   and regenerates the client.
3. Production deploy (via `deploy.sh quick-api`): the deploy runs
   `prisma migrate deploy` automatically — never `prisma migrate reset`.
4. If the change is purely cosmetic and you can't use a migration,
   use `prisma db push` ONLY in local dev.

## To add a new model

1. Define the model in `schema.prisma` with explicit `@id`, `@@index`
   on every FK, and `onDelete` policy.
2. Add a corresponding TypeScript type / interface in
   `api/src/types/*.d.ts` if you'll import it from a service.
3. If the model is exposed to the frontend, add a type to
   `src/lib/api.ts` and a typed fetcher.
4. Run `npx prisma generate` after the migration.

## To add a new enum

Use it sparingly — prefer strings when the value set may grow
(e.g. `User.role` is a `String`, not `enum Role`). Reserve enums for
truly closed sets: `TicketStatus`, `TicketOwnerType`.

## Indexes

For every foreign-key column on a hot table, add a `@@index` — the
Prisma schema already has them on `Pincode`, `ConversationSession`,
`SimulateMessage`, `TroubleshootingSession`. Continue the pattern.

## Money / timestamps
- Timestamps: `DateTime @default(now())` and `@updatedAt`.
- Big numbers: `Int` for counts, `String` for IDs, `Decimal` only if
  you'll do real arithmetic (we currently don't have any).

## Common patterns

```prisma
model Foo {
  id        String   @id @default(uuid())
  // ... fields ...
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // relations
  barId String?
  bar   Bar?   @relation(fields: [barId], references: [id], onDelete: SetNull)

  @@index([barId])
}
```

## Never do this
- ❌ Edit a migration file after it's been deployed.
- ❌ `prisma migrate reset` against the VPS.
- ❌ Remove a column from `Conversation` / `Message` / `SupportRequest`.
- ❌ Add a `JSON` field where a separate model would be cleaner
  (we already overuse `Json` — `@db.Text` JSON blobs on `Ticket`).

## Quick checks after a schema change
- [ ] `npx prisma format` — keeps formatting consistent.
- [ ] `npx prisma validate` — catches invalid references.
- [ ] `npx tsc --noEmit -p api` — catches stale client types.
- [ ] Restart the API container so the new client is loaded.