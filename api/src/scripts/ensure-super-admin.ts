/**
 * Upsert Super Admin user for existing databases.
 * Usage: npx ts-node --transpile-only src/scripts/ensure-super-admin.ts
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = "superadmin@poornasree.com";
const PASSWORD = "SuperAdmin@1234";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { role: "super_admin", passwordHash, firstName: "Super", lastName: "Admin" },
    });
    console.log(`Updated ${EMAIL} → super_admin`);
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
      },
    });
    console.log(`Created ${EMAIL} → super_admin`);
  }
  console.log(`Login: ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
