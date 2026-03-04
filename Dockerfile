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

# API calls are proxied server-side via next.config.mjs rewrites.
# NEXT_PUBLIC_API_URL is NOT required at build time for Docker deployments.
# Only pass it as a --build-arg if the API is on a completely different domain.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ============================================================
# Stage 3: production
#   Node 20 Alpine image.
#   Runs Next.js via `npm run start` on 0.0.0.0:3000 so that
#   docker-compose port mapping  3000:3000  works correctly.
#   Runtime env vars (API URLs, secrets) are injected via
#   docker run -e / Kubernetes secrets / compose env_file.
# ============================================================
FROM node:20-alpine AS production

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Explicitly lock the port — prevents any external PORT env var from overriding the -p flag
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Prevent OOM crashes in constrained containers (512 MB heap limit)
ENV NODE_OPTIONS="--max-old-space-size=512"
# API container hostname (Docker internal network). Overridden by env_file / -e flag.
ENV API_INTERNAL_URL=http://api:4000

# Unprivileged user — never run Node servers as root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Production node_modules from the deps stage
COPY --from=deps  --chown=nextjs:nodejs /app/node_modules ./node_modules

# Build output and project files
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

# Runs: next start -p 3000 -H 0.0.0.0
CMD ["npm", "run", "start"]
