const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const sn = process.argv[2] || "D550202";
p.ticket
  .findFirst({
    where: { ticketNumber: { contains: sn } },
    select: { ticketNumber: true, problemDescription: true, issueDescription: true },
  })
  .then((t) => console.log(JSON.stringify(t, null, 2)))
  .finally(() => p.$disconnect());
