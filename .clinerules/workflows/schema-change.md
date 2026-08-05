# Workflow: Prisma schema change

> Used when the user asks to add a field, model, index, or enum.

## Steps

1. **Read** `api/prisma/schema.prisma` (564 lines) and confirm the
   change doesn't conflict with the frozen legacy models:
   `Conversation`, `Message`, `SupportRequest`, `SupportMessage`,
   `ConversationSession`.
2. **Edit** `api/prisma/schema.prisma`:
   - For new fields: add the field, choose the right type
     (`String`, `Int`, `DateTime`, `Boolean`, `Json`, `Decimal`).
   - For new models: add `@id`, `@@index` on every FK, `onDelete`
     policy, `createdAt`, `updatedAt`.
   - For new enums: reserve for closed sets (`TicketStatus`,
     `TicketOwnerType` are enums; `User.role` is a `String`).
3. **Generate migration locally**:
   ```bash
   cd api
   npx prisma migrate dev --name <short_slug>
   ```
   This creates `api/prisma/migrations/<timestamp>_<slug>/migration.sql`
   and regenerates the client.
4. **Inspect** the generated SQL — make sure it's what you intended.
   Don't accept auto-generated destructive migrations without
   thought.
5. **Verify locally**:
   - [ ] `npx prisma format` — keeps formatting consistent.
   - [ ] `npx prisma validate` — catches invalid references.
   - [ ] `npx tsc --noEmit -p api` — catches stale client types.
   - [ ] Restart the local API container / dev server.
6. **Commit** the migration alongside your schema change.
7. **Production deploy** is automatic via `deploy.sh quick-api`,
   which runs `prisma migrate deploy` before bringing the new API
   container up. **Never** run `prisma migrate reset` on the server.

## Don't do
- ❌ Edit a migration file after it's been deployed.
- ❌ Add a field to `Conversation` / `Message` / `SupportRequest` —
  they're frozen.
- ❌ Add a JSON blob when a separate model would be cleaner.
- ❌ Skip the `@@index` on a new FK column.
- ❌ Forget to update `src/lib/api.ts` if the new model is exposed
  to the frontend.

## If you need to seed new data

Add to `api/prisma/seed.ts` (already exists). Run locally with
`npx prisma db seed`. Never run `db seed` against production unless
explicitly told to.

## After deploy
Verify on the server:
```bash
ssh poornasree-v4
cd /root/poornasree-ai
docker compose exec api npx prisma migrate status