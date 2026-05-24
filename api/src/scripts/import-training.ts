/**
 * One-time script: import training.json into TroubleshootingTemplate DB.
 * Run with: npx ts-node src/scripts/import-training.ts
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Try a few common paths for the training.json file
  const candidates = [
    path.resolve(__dirname, "../../../public/Doc/training.json"),
    path.resolve(__dirname, "../../public/Doc/training.json"),
    "/home/deploy/poornasree-ai/public/Doc/training.json",
  ];

  let trainingPath = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) { trainingPath = c; break; }
  }

  if (!trainingPath) {
    console.error("❌ training.json not found. Searched:", candidates);
    process.exit(1);
  }

  console.log(`📂 Loading: ${trainingPath}`);
  const raw = fs.readFileSync(trainingPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed?.intents)) {
    console.error("❌ Invalid format: expected { intents: [...] }");
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const intent of parsed.intents) {
    if (!intent.tag || !Array.isArray(intent.responses) || !intent.responses[0]) {
      skipped++;
      continue;
    }

    const response = intent.responses[0] as string;
    const stepLines = response
      .split("\n")
      .filter((l: string) => /^\d+\.\s/.test(l.trim()));
    const steps = stepLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());

    if (steps.length === 0) {
      console.log(`⚠️  Skipping ${intent.tag} — no numbered steps found`);
      skipped++;
      continue;
    }

    const title = (intent.tag as string)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    const description = Array.isArray(intent.patterns)
      ? intent.patterns.join(" | ")
      : intent.tag;

    try {
      const existing = await prisma.troubleshootingTemplate.findUnique({
        where: { problemType: intent.tag },
      });

      if (existing) {
        await prisma.troubleshootingStep.deleteMany({ where: { templateId: existing.id } });
        await prisma.troubleshootingTemplate.update({
          where: { id: existing.id },
          data: {
            title,
            description,
            isActive: true,
            audience: "both",
            steps: {
              create: steps.map((s: string, i: number) => ({
                stepNumber: i + 1,
                stepContent: s,
              })),
            },
          },
        });
        console.log(`✏️  Updated: ${intent.tag} (${steps.length} steps)`);
        updated++;
      } else {
        await prisma.troubleshootingTemplate.create({
          data: {
            problemType: intent.tag,
            title,
            description,
            isActive: true,
            audience: "both",
            steps: {
              create: steps.map((s: string, i: number) => ({
                stepNumber: i + 1,
                stepContent: s,
              })),
            },
          },
        });
        console.log(`✅ Created: ${intent.tag} (${steps.length} steps)`);
        created++;
      }
    } catch (err) {
      console.error(`❌ Error on ${intent.tag}:`, err);
      skipped++;
    }
  }

  console.log(`\n🎉 Done! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
