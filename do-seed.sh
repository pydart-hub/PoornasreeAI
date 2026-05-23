#!/bin/bash
cd /root/poornasree-ai
echo "Running prisma db seed..."
docker compose exec -T api npx prisma db seed
