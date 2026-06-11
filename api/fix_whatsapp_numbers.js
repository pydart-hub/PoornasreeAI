const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeWhatsappNumber(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      whatsappNumber: { not: null }
    }
  });

  let count = 0;
  for (const u of users) {
    if (u.whatsappNumber) {
      const normalized = normalizeWhatsappNumber(u.whatsappNumber);
      if (normalized && normalized !== u.whatsappNumber) {
        await prisma.user.update({
          where: { id: u.id },
          data: { whatsappNumber: normalized }
        });
        console.log(`Updated ${u.firstName} (${u.email}): ${u.whatsappNumber} -> ${normalized}`);
        count++;
      }
    }
  }
  console.log(`Updated ${count} users.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
