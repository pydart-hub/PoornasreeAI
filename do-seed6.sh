#!/bin/bash
cd /root/poornasree-ai

# Write seed.js into the app directory (where node_modules are)
docker compose exec -T api sh -c "cat > /app/seed.js" << 'JSEOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const SEED_PINCODES = [
  { code: '600001', place: 'Chennai Central', district: 'Chennai', state: 'Tamil Nadu' },
  { code: '110001', place: 'New Delhi', district: 'New Delhi', state: 'Delhi' },
];

const SEED_USERS = [
  { email: 'admin@poornasree.com',     password: 'Admin@1234',    firstName: 'Admin',   lastName: 'Poornasree', role: 'admin' },
  { email: 'manager@poornasree.com',   password: 'Manager@1234',  firstName: 'Rajan',   lastName: 'Kumar',      role: 'service_manager', pincodeCode: '600001' },
  { email: 'engineer1@poornasree.com', password: 'Engineer@1234', firstName: 'Suresh',  lastName: 'Nair',       role: 'service_engineer', pincodeCode: '600001' },
  { email: 'engineer2@poornasree.com', password: 'Engineer@1234', firstName: 'Priya',   lastName: 'Sharma',     role: 'service_engineer', pincodeCode: '600001' },
  { email: 'engineer3@poornasree.com', password: 'Engineer@1234', firstName: 'Anil',    lastName: 'Gupta',      role: 'service_engineer', pincodeCode: '110001' },
  { email: 'dealer@poornasree.com',    password: 'Dealer@1234',   firstName: 'Amit',    lastName: 'Patel',      role: 'dealer', pincodeCode: '600001' },
];

async function main() {
  console.log('Seeding pincodes...');
  const pincodeMap = {};
  for (const p of SEED_PINCODES) {
    const r = await prisma.pincode.upsert({ where: { code: p.code }, update: {}, create: p });
    pincodeMap[p.code] = r.id;
    console.log('  + Pincode', p.code, p.place);
  }

  console.log('Seeding users...');
  for (const u of SEED_USERS) {
    const pincodeId = u.pincodeCode ? pincodeMap[u.pincodeCode] : null;
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log('  = Already exists:', u.email);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.create({ data: { email: u.email, passwordHash, firstName: u.firstName, lastName: u.lastName, role: u.role, pincodeId } });
    console.log('  + Created:', u.email, '(' + u.role + ')');
  }

  const all = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log('\nAll users:');
  all.forEach(u => console.log(' ', u.role, u.email));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
JSEOF

echo "Running JS seed from /app..."
docker compose exec -T api node /app/seed.js
