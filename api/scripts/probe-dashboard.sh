#!/bin/bash
set -e
cd /root/poornasree-ai
docker compose exec -T api node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'ad76a460-9578-4bc8-b719-59711e5511a2',role:'service_manager',pincodeId:null},process.env.JWT_SECRET,{expiresIn:'1h'}));" > /tmp/tok.txt
TOKEN=$(tr -d '\n\r' < /tmp/tok.txt)
echo "token_len=${#TOKEN}"
code=$(curl -s -b "token=${TOKEN}" -o /tmp/eng.out -w "%{http_code}" http://127.0.0.1:4000/api/manager/engineers)
echo "engineers HTTP ${code}"
head -c 600 /tmp/eng.out
echo
code2=$(curl -s -b "token=${TOKEN}" -o /tmp/tix.out -w "%{http_code}" http://127.0.0.1:4000/api/tickets)
echo "tickets HTTP ${code2}"
head -c 200 /tmp/tix.out
echo
code3=$(curl -s -b "token=${TOKEN}" -X POST -o /tmp/rs.out -w "%{http_code}" http://127.0.0.1:4000/api/manager/engineers/$(docker compose exec -T db psql -U poorna_user -d poornasree_ai -tAc "SELECT id FROM \"User\" WHERE email='ijas@gmail.com' LIMIT 1" | tr -d ' \n')/resend-setup-link)
echo "resend HTTP ${code3}"
cat /tmp/rs.out
echo
docker compose logs api --tail 20 2>&1 | grep -i error || true
