// Server-side only: print 4-digit OTP for a ticket id (E2E test). Usage: node read-test-otp.js <ticketId>
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const id = process.argv[2];
if (!id) {
  console.error("usage: node read-test-otp.js <ticketId>");
  process.exit(1);
}

(async () => {
  const p = new PrismaClient();
  try {
    const t = await p.ticket.findUnique({ where: { id } });
    if (!t?.otpCodeHash) process.exit(1);
    for (let n = 1000; n <= 9999; n++) {
      const code = String(n);
      if (await bcrypt.compare(code, t.otpCodeHash)) {
        console.log(code);
        process.exit(0);
      }
    }
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
