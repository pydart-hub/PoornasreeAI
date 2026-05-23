#!/bin/bash
cd /root/poornasree-ai
docker compose exec -T api node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count()
  .then(c => { console.log('Total users:', c); return p.user.findMany({ select: { email: true, role: true }, take: 20 }); })
  .then(u => u.forEach(x => console.log(x.role, x.email)))
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => p.\$disconnect());
"
