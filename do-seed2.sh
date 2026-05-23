#!/bin/bash
cd /root/poornasree-ai
echo "=== package.json prisma config ==="
docker compose exec -T api cat package.json | grep -A 5 prisma
echo ""
echo "=== Running seed via ts-node directly ==="
docker compose exec -T api npx ts-node --compiler-options '{"module":"commonjs"}' prisma/seed.ts
