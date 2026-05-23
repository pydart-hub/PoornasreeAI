#!/bin/bash
cd /root/poornasree-ai
echo "=== Using container's own ts-node ==="
docker compose exec -T api sh -c "cd /app && node_modules/.bin/ts-node --transpile-only --project tsconfig.json prisma/seed.ts"
