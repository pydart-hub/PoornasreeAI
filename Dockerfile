# ============================================================
# Stage 1: deps
#   Install ONLY production dependencies.
#   Reused directly in the final image — no rebuild needed.
# ============================================================
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev


# ============================================================
# Stage 2: builder
#   Install ALL dependencies (dev + prod), then build.
#   The standalone output traces every file the server needs
#   into .next/standalone — drastically reducing final image size.
# ============================================================
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variables consumed at BUILD time (e.g. NEXT_PUBLIC_*) can be
# passed here:  --build-arg NEXT_PUBLIC_API_URL=...
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ============================================================
# Stage 3: production
#   Lean Node 20 Alpine image.
#   Contains only the standalone server + static assets.
#   Runtime env vars (API URLs, secrets) are injected via
#   docker run -e / Kubernetes secrets / compose env_file.
# ============================================================
FROM node:20-alpine AS production

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Unprivileged user — never run Node servers as root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Static files served by Next.js internally
COPY --from=builder /app/public ./public

# Standalone server bundle (includes its own minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static build output expected at .next/static inside standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# next start via the standalone server.js (same behaviour, ~300 MB smaller image)
CMD ["node", "server.js"]
