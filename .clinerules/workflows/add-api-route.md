# Workflow: Add a new API route

> Used when the user asks to add a new HTTP endpoint to the Express
> backend.

## Steps

1. **Read** the bootstrap file `api/src/index.ts` to see current
   mount order. **Order matters** (see `.clinerules/rules/api-routes.md`).
2. **Decide** the prefix: `/api/<feature>`.
3. **Decide** public vs auth:
   - Public? → add to an existing public router, or create a new
     one and mount it **above** `app.use("/api", chatRoutes)`.
   - Auth? → pick roles, add `router.use(protect)` at the top of the
     router, and `authorize(...roles)` per-endpoint.
4. **Create** `api/src/routes/<feature>.routes.ts`:
   ```ts
   import { Router } from "express";
   import { protect, authorize } from "../middleware/auth";
   import { fooHandler, barHandler } from "../controllers/<feature>.controller";

   const router = Router();
   router.use(protect);                 // remove if public
   router.get("/", authorize("admin"), fooHandler);
   router.post("/", authorize("customer", "dealer"), barHandler);

   export default router;
   ```
5. **Create** `api/src/controllers/<feature>.controller.ts`:
   ```ts
   import { Request, Response } from "express";

   export async function fooHandler(req: Request, res: Response) {
     // business logic
     res.json({ ok: true });
   }
   ```
6. **Mount** in `api/src/index.ts` at the correct position.
7. **Add typed wrapper** in `src/lib/api.ts` so frontend can call it
   via `apiFetch<T>` with `credentials: "include"`.
8. **If it accepts uploads**, use `multer` and save under `api/uploads/`.
   The Next.js proxy already serves `/uploads/*`.
9. **Verify**:
   - [ ] `cd api && npx tsc --noEmit` — clean.
   - [ ] `curl http://localhost:4000/health` — API up.
   - [ ] Test the endpoint via curl or PowerShell with cookie/Bearer.
   - [ ] Test 401 case (no auth header) for protected routes.
   - [ ] Test 403 case (wrong role) for role-gated routes.

## Edge cases

- **The endpoint needs a new Prisma model/field** → use the
  `prisma-schema.md` workflow instead.
- **The endpoint needs to be reached from the live WhatsApp bot** →
  don't add it to a webhook handler; route via the FSM.
- **The endpoint is a one-off** → consider adding it inline to
  `api/src/index.ts` as `app.get(...)` rather than creating a router.

## Common pitfalls
- ❌ Forgetting `router.use(protect)` at the top of a private router.
- ❌ Mounting a new public router **after** `app.use("/api", chatRoutes)`.
- ❌ Returning `res.send()` for JSON (use `res.json()`).
- ❌ Adding `try/catch` and returning 500 — Express 5 forwards thrown
  errors to the error middleware if your handler is `async`.
- ❌ Skipping the typed wrapper in `src/lib/api.ts` — frontend will
  re-implement the fetch and lose error handling.