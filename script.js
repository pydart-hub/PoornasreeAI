const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.pincode.findMany({ take: 5, select: { code: true, place: true, state: true } })
  .then(r => {
    console.log(JSON.stringify(r, null, 2));
    p.$disconnect();
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
