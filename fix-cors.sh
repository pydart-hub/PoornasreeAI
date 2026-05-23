#!/bin/bash
cd /root/poornasree-ai

# Update CORS_ORIGIN and FRONTEND_URL to use domain
sed -i 's|CORS_ORIGIN=http://168.231.121.19|CORS_ORIGIN=http://poornasree.pydart.com|' .env
sed -i 's|FRONTEND_URL=http://168.231.121.19|FRONTEND_URL=http://poornasree.pydart.com|' .env

echo "=== Updated .env ==="
grep -E 'CORS_ORIGIN|FRONTEND_URL' .env

echo ""
echo "=== Restarting API container ==="
docker compose restart api

echo ""
echo "=== API container status ==="
docker compose ps api
