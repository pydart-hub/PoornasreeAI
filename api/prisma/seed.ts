import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// ── Pincodes (geographic routing zones) ──────────────────────────────────
const SEED_PINCODES = [
  { code: "600001", regionName: "Chennai Central" },
  { code: "110001", regionName: "New Delhi" },
];

// ── Users with role-based assignments ────────────────────────────────────
const SEED_USERS: {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  role: string;
  pincodeCode?: string; // links to Pincode.code
}[] = [
  // Admin (R&D) — no pincode
  {
    email: "admin@poornasree.com",
    password: "Admin@1234",
    firstName: "Admin",
    lastName: "Poornasree",
    role: "admin",
  },
  // Service Manager — mapped to Chennai
  {
    email: "manager@poornasree.com",
    password: "Manager@1234",
    firstName: "Rajan",
    lastName: "Kumar",
    role: "service_manager",
    pincodeCode: "600001",
  },
  // Service Engineers — 2 in Chennai, 1 in Delhi
  {
    email: "engineer1@poornasree.com",
    password: "Engineer@1234",
    firstName: "Suresh",
    lastName: "Nair",
    role: "service_engineer",
    pincodeCode: "600001",
  },
  {
    email: "engineer2@poornasree.com",
    password: "Engineer@1234",
    firstName: "Priya",
    lastName: "Sharma",
    role: "service_engineer",
    pincodeCode: "600001",
  },
  {
    email: "engineer3@poornasree.com",
    password: "Engineer@1234",
    firstName: "Anil",
    lastName: "Gupta",
    role: "service_engineer",
    pincodeCode: "110001",
  },
  // Dealer — mapped to Chennai
  {
    email: "dealer@poornasree.com",
    password: "Dealer@1234",
    firstName: "Amit",
    lastName: "Patel",
    role: "dealer",
    pincodeCode: "600001",
  },
  // Note: Customers use WhatsApp only — no login needed per plan.md
];

async function main() {
  console.log("Seeding pincodes...\n");

  // ── Upsert pincodes ────────────────────────────────────────────────────
  const pincodeMap = new Map<string, string>(); // code → id
  for (const p of SEED_PINCODES) {
    const existing = await prisma.pincode.findUnique({ where: { code: p.code } });
    if (existing) {
      pincodeMap.set(p.code, existing.id);
      console.log(`  ✓ Pincode ${p.code} (${p.regionName}) — already exists`);
    } else {
      const created = await prisma.pincode.create({ data: p });
      pincodeMap.set(p.code, created.id);
      console.log(`  + Pincode ${p.code} (${p.regionName}) — created`);
    }
  }

  console.log("\nSeeding users...\n");

  // ── Upsert users ──────────────────────────────────────────────────────
  for (const u of SEED_USERS) {
    const pincodeId = u.pincodeCode ? pincodeMap.get(u.pincodeCode) ?? null : null;
    const existing = await prisma.user.findUnique({ where: { email: u.email } });

    if (existing) {
      // Update role and pincode in case they changed
      await prisma.user.update({
        where: { email: u.email },
        data: { role: u.role, pincodeId },
      });
      console.log(`  ✓ ${u.email} (${u.role}) — updated`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName ?? null,
        role: u.role,
        pincodeId,
      },
    });
    console.log(`  + ${u.email} (${u.role}) — created`);
  }

  console.log("\nDone! Seeded users:");
  const all = await prisma.user.findMany({
    select: { email: true, firstName: true, role: true, pincodeId: true },
  });
  console.table(all);

  // ── Seed troubleshooting templates ──────────────────────────────────────
  console.log("\nSeeding troubleshooting templates...\n");

  const SEED_TEMPLATES = [
    {
      problemType: "power_issue",
      title: "Power Issue Troubleshooting",
      description: "Step-by-step guide when the machine does not power on.",
      steps: [
        "Check if the power cable is firmly connected to the machine and the wall outlet.",
        "Check the power adapter — ensure the LED indicator is on. Try a different adapter if available.",
        "Try plugging the machine into a different power socket.",
        "Check the main power switch or circuit breaker at your location.",
      ],
    },
    {
      problemType: "no_display",
      title: "No Display Troubleshooting",
      description: "Step-by-step guide when the screen shows nothing.",
      steps: [
        "Check if the display cable is securely connected at both ends.",
        "Restart the device by holding the power button for 10 seconds, then turning it back on.",
        "Verify the power supply — ensure the power LED is lit.",
        "Try connecting to an external monitor if available.",
      ],
    },
    {
      problemType: "vibration_issue",
      title: "Abnormal Vibration Troubleshooting",
      description: "Step-by-step guide for excessive or unusual vibrations.",
      steps: [
        "Ensure the machine is placed on a flat, stable surface.",
        "Check if any external objects are in contact with the machine body.",
        "Inspect the machine feet/pads — ensure they are intact and level.",
        "Run the machine at minimum speed and observe if vibration reduces.",
        "Check if the load/sample is evenly distributed inside the machine.",
      ],
    },
  ];

  for (const t of SEED_TEMPLATES) {
    const existing = await prisma.troubleshootingTemplate.findUnique({
      where: { problemType: t.problemType },
    });

    if (existing) {
      console.log(`  ✓ Template "${t.problemType}" — already exists, skipping`);
      continue;
    }

    await prisma.troubleshootingTemplate.create({
      data: {
        problemType: t.problemType,
        title: t.title,
        description: t.description,
        steps: {
          create: t.steps.map((content, i) => ({
            stepNumber: i + 1,
            stepContent: content,
          })),
        },
      },
    });
    console.log(`  + Template "${t.problemType}" (${t.steps.length} steps) — created`);
  }

  // ── Seed product catalogue ─────────────────────────────────────────────
  console.log("\nSeeding products...\n");

  const SEED_PRODUCTS = [
    { name: "Milk Analyzer",       displayOrder: 1 },
    { name: "Vibro Machine",       displayOrder: 2 },
    { name: "Solar Charger",       displayOrder: 3 },
    { name: "Cream Separator",     displayOrder: 4 },
    { name: "Fat Analyzer",        displayOrder: 5 },
    { name: "Stirrer / Agitator",  displayOrder: 6 },
    { name: "Water Pump",          displayOrder: 7 },
    { name: "Other / General",     displayOrder: 8 },
  ];

  for (const p of SEED_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) {
      console.log(`  ✓ Product "${p.name}" — already exists`);
      continue;
    }
    await prisma.product.create({ data: p });
    console.log(`  + Product "${p.name}" — created`);
  }

  console.log("\nAll seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
