# ============================================================
# Stage 1: builder
#   - Installs all dependencies (including devDependencies)
#   - Generates the Prisma client
#   - Compiles TypeScript → /app/dist
#   - Prunes devDependencies so only production modules remain
# ============================================================
FROM node:20-slim AS builder

# Native module build tools + openssl (required by bcrypt and Prisma)
RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL dependencies first (dev + prod)
COPY package*.json ./
RUN npm ci

# Generate Prisma client (writes into node_modules/@prisma/client)
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies so we only ship production modules
RUN npm prune --omit=dev


# ============================================================
# Stage 2: production
#   - Lean node:20-slim image
#   - Only contains: node_modules, dist, prisma
# ============================================================
FROM node:20-slim AS production

# Required by Prisma at runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pruned production node_modules (includes compiled native .node files)
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy Prisma schema (needed for potential runtime migrations / introspection)
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/index.js"]
