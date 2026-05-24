#!/bin/bash
cd /root/poornasree-ai
echo "Pulling latest code..."
git pull origin AIpoorna

echo ""
echo "Rebuilding frontend..."
docker compose build app

echo ""
echo "Restarting frontend..."
docker compose up -d app

echo ""
echo "Status:"
docker compose ps app
