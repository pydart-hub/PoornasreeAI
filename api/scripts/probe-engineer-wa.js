// Run on VPS: docker compose exec -T api node scripts/probe-engineer-wa.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const engineers = await prisma.user.findMany({
    where: {
      OR: [
        { whatsappNumber: { contains: "8089732385" } },
        { email: { contains: "ijaz", mode: "insensitive" } },
      ],
    },
    select: {
      email: true,
      firstName: true,
      whatsappNumber: true,
      setPasswordToken: true,
      setPasswordTokenExpiry: true,
      role: true,
    },
    take: 5,
  });
  console.log(JSON.stringify(engineers, null, 2));

  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_ACCESS_TOKEN;
  const to = "918089732385";
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: "Poornasree test — if you see this, WhatsApp delivery works.", preview_url: false },
    }),
  });
  const body = await res.text();
  console.log("WA status:", res.status);
  console.log("WA body:", body);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
