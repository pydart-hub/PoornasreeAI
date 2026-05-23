#!/bin/bash
cd /root/poornasree-ai
echo "=== Container working dir ==="
docker compose exec -T api pwd
echo "=== Files at /app ==="
docker compose exec -T api ls /app/
echo ""
echo "=== Running seed with transpile-only ==="
docker compose exec -T api sh -c "cd /app && npx ts-node --transpile-only prisma/seed.ts"
