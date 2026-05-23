#!/bin/bash
echo "=== Test admin login ==="
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@poornasree.com","password":"Admin@1234"}' | python3 -m json.tool 2>/dev/null || echo "Raw response above"

echo ""
echo "=== Test manager login ==="
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@poornasree.com","password":"Manager@1234"}' | python3 -m json.tool 2>/dev/null || echo "Raw response above"
