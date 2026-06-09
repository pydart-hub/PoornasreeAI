#!/bin/bash
cd /root/poornasree-ai

# Update .env to use HTTPS
sed -i 's|CORS_ORIGIN=http://poornasree.pydart.com|CORS_ORIGIN=https://poornasree.pydart.com|' .env
sed -i 's|FRONTEND_URL=http://poornasree.pydart.com|FRONTEND_URL=https://poornasree.pydart.com|' .env

echo "=== Updated .env ==="
grep -E 'CORS_ORIGIN|FRONTEND_URL' .env

echo ""
echo "=== Restarting API container ==="
docker compose restart api

echo ""
echo "=== All containers ==="
docker compose ps
