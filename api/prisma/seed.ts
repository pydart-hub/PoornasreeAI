import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// ── Seed users matching the existing frontend mock credentials ──
const SEED_USERS = [
  {
    email: "admin@poornasree.com",
    password: "password123",
    firstName: "Admin",
    lastName: "Poornasree",
    role: "admin",
  },
  {
    email: "service@poornasree.com",
    password: "Service@123",
    firstName: "Rajan",
    lastName: "Kumar",
    role: "service",
  },
  {
    email: "rd@poornasree.com",
    password: "RnD@1234",
    firstName: "Priya",
    lastName: "Sharma",
    role: "r_and_d",
  },
  {
    email: "customer@example.com",
    password: "Customer@123",
    firstName: "Amit",
    lastName: "Patel",
    role: "customer",
  },
];

async function main() {
  console.log("Seeding users...\n");

  for (const u of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`  ✓ ${u.email} (${u.role}) — already exists, skipping`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
      },
    });
    console.log(`  + ${u.email} (${u.role}) — created`);
  }

  console.log("\nDone! Seeded users:");
  const all = await prisma.user.findMany({
    select: { email: true, firstName: true, role: true },
  });
  console.table(all);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
