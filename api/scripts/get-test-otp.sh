#!/bin/bash
# E2E only: print OTP for ticket id (admin resend). Usage: ./get-test-otp.sh <ticketId>
set -e
TID="$1"
cd /root/poornasree-ai
docker compose exec -T -e "TID=$TID" api node -e '
const { PrismaClient } = require("@prisma/client");
const ts = require("./dist/services/ticket.service");
const p = new PrismaClient();
(async () => {
  const t = await p.ticket.findUnique({ where: { id: process.env.TID } });
  if (!t || !t.assignedEngineerId) process.exit(1);
  const r = await ts.requestOTP(t.id, t.assignedEngineerId, true, true);
  console.log(r.otp);
  await p.$disconnect();
})().catch(() => process.exit(1));
'
