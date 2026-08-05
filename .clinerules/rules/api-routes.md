# Rule: API routes, auth, and route mount order

## Bootstrap file
`api/src/index.ts` mounts everything. **Order matters.**

```ts
// PUBLIC (no auth) — must come first
app.use("/api/whatsapp",        whatsappRoutes);    // Meta webhook
app.use("/api/tickets",         ticketRoutes);      // ??
app.use("/api/troubleshooting", troubleshootingRoutes);
app.use("/api/public",          publicRoutes);
app.use("/api/simulate",        simulateRoutes);
app.get("/api/branding", getBranding);
app.get("/api/rd-videos", protect, listRdVideos);

// AUTHENTICATED — must come AFTER any no-auth path with the same prefix
app.use("/api/admin",        adminRoutes);
app.use("/api/super-admin",  superAdminRoutes);
app.use("/api/manager",      managerRoutes);
app.use("/api/support",      supportRoutes);
app.use("/api/sales",        salesRoutes);
app.use("/api/work-reports", workReportRoutes);
app.use("/api/marketing",    marketingRoutes);
app.use("/api/complaints",   complaintRoutes);
app.use("/api/support-chat", protect, supportChatRoutes);
app.use("/api",              chatRoutes);  // ⚠️ broad mount — protect on everything
```

### Why order matters
`chatRoutes` does `router.use(protect)` internally, so any URL it
matches will be auth-gated. If you mount a public route under `/api/*`
**after** the broad `chatRoutes` mount, it will return 401.

If you need a new public endpoint under an existing prefix:
- Add it to the matching public router (e.g. `public.routes.ts`), OR
- Add an explicit `app.get(...)` or `app.use(...)` **above** the
  broad mount.

## Auth middleware

`api/src/middleware/auth.ts` exports:

```ts
protect          // verifies JWT, sets req.user
authorize(...)   // role check (use AFTER protect)
requireAuth      // alias for protect
requireRole      // alias for authorize
```

Pattern in routes:
```ts
router.use(protect);                                  // protect all
router.get("/", authorize("admin", "service_manager"), handler);
router.patch("/:id/assign-engineer",
  authorize("service_manager", "assistant_service_manager", "admin"),
  assignEngineer);
```

`req.user` shape (declared via module augmentation):
```ts
{ userId: string; role: string; pincodeId?: string | null }
```

## Adding a new route — checklist

1. Pick a prefix: `/api/<feature>`. Check for collisions.
2. Create `api/src/routes/<feature>.routes.ts`.
3. Create `api/src/controllers/<feature>.controller.ts` with named
   exports.
4. Decide: public or auth? If auth, decide which roles.
5. Mount in `api/src/index.ts` at the correct position.
6. Add a typed wrapper in `src/lib/api.ts` for browser callers.
7. Document in `docs/API.md`.

## Upload routes (multipart)
Use `multer` middleware. Files land in `api/uploads/`. The Next.js
proxy rewrites `/uploads/*` → `${API_HOST}/uploads/*` so the browser
can fetch them directly via `/uploads/<filename>`.

```ts
// In api/src/index.ts
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));
```

For work-report images see `src/lib/api.ts → uploadWorkReportImage()`
for the canonical browser pattern.

## Socket.IO
`api/src/lib/socket.ts` exports `initSocket(httpServer)` and `io`.
The Next.js client connects via `/socket.io` proxy rewrite in
`next.config.mjs`. Used for:
- Test-panel live updates (`api/src/services/simulate.service.ts`)
- Engineer ↔ customer manual chat (`api/src/routes/support-chat.ts`)
- Service-manager dashboard real-time ticket updates

## Health
- `GET /health` → `{ status, env }`  — used by Docker healthcheck,
  deploy scripts, and Cline's smoke tests.
- `GET /` → service banner.

## Common mistakes
- ❌ Forgetting `router.use(protect)` at the top of a private router.
- ❌ Mounting a new public router **after** `app.use("/api", chatRoutes)`.
- ❌ Returning 500 from inside an async handler instead of throwing
  (Express 5 forwards thrown errors to the error middleware, but only
  if the handler is `async` and you `await` it).
- ❌ Using `res.send()` for JSON — use `res.json()`.
- ❌ Forgetting to add a typed helper in `src/lib/api.ts`.