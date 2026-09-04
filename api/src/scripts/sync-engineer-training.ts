import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { invalidateTrainingCatalogCache } from "../services/training-catalog.service";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Engineer Training Sync to Database...");

  const candidatePaths = [
    path.resolve(__dirname, "../../../docs/Engineers Training.xlsx"),
    path.resolve(process.cwd(), "../docs/Engineers Training.xlsx"),
    path.resolve(process.cwd(), "docs/Engineers Training.xlsx"),
    "/app/docs/Engineers Training.xlsx",
  ];

  let excelPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!excelPath) {
    console.error("❌ Engineers Training.xlsx not found in:", candidatePaths);
    process.exit(1);
  }

  console.log(`📂 Found Excel at: ${excelPath}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  let sheet = wb.getWorksheet("Training Data");
  if (!sheet) {
    sheet = wb.worksheets.find((s) => s.name.trim().toLowerCase() === "training data");
  }
  if (!sheet) {
    console.error("❌ 'Training Data' sheet not found in workbook.");
    process.exit(1);
  }

  let upserted = 0;
  let skipped = 0;

  const rows: Array<{
    tag: string;
    title: string;
    description: string;
    steps: string[];
  }> = [];

  const seenTags = new Set<string>();

  sheet.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return;
    const cells = row.values as (string | null | undefined)[];
    const tag = cells[1] ? String(cells[1]).trim() : "";
    const title = cells[2] ? String(cells[2]).trim() : "";
    const stepsStr = cells[3] ? String(cells[3]).trim() : "";

    if (!tag || !title || !stepsStr) return;
    if (tag.toLowerCase() === "tag" || tag.toLowerCase() === "problem type") return;
    if (title.toLowerCase() === "patterns" || stepsStr.toLowerCase().includes("troubleshooting steps")) return;

    if (seenTags.has(tag)) return;
    seenTags.add(tag);

    const patternsList = title
      .split("\n")
      .flatMap((line) => line.split("|"))
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const primaryTitle = patternsList[0] || tag.replace(/_/g, " ");

    const parsedSteps: string[] = [];
    for (const line of stepsStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const m = line.match(/^(\d+)[\.\)]\s*(.*)/);
      if (m) {
        parsedSteps.push(m[2].trim());
      } else if (line.startsWith("•") || line.startsWith("-")) {
        if (parsedSteps.length > 0) {
          parsedSteps[parsedSteps.length - 1] += ` -> ${line.replace(/^[•\-]\s*/, "").trim()}`;
        } else {
          parsedSteps.push(line.replace(/^[•\-]\s*/, "").trim());
        }
      }
    }

    if (parsedSteps.length === 0) {
      console.warn(`⚠️  Skipping row ${rowIdx} (tag: ${tag}) - no steps parsed`);
      skipped++;
      return;
    }

    rows.push({
      tag,
      title: primaryTitle,
      description: patternsList.join(" | "),
      steps: parsedSteps,
    });
  });

  console.log(`📋 Found ${rows.length} valid engineer issues in Excel (skipped: ${skipped})`);

  for (const item of rows) {
    const existing = await prisma.documentIssue.findUnique({
      where: { problemType: item.tag },
    });

    if (existing) {
      await prisma.documentIssueStep.deleteMany({ where: { issueId: existing.id } });
      await prisma.documentIssue.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          description: item.description,
          audience: "engineer",
          isActive: true,
          steps: {
            create: item.steps.map((s, i) => ({
              stepNumber: i + 1,
              stepContent: s,
            })),
          },
        },
      });
    } else {
      await prisma.documentIssue.create({
        data: {
          problemType: item.tag,
          title: item.title,
          description: item.description,
          audience: "engineer",
          isActive: true,
          steps: {
            create: item.steps.map((s, i) => ({
              stepNumber: i + 1,
              stepContent: s,
            })),
          },
        },
      });
    }
    upserted++;
  }

  console.log(`✅ Successfully synced ${upserted} engineer training issues to DocumentIssue table!`);

  const engineerCount = await prisma.documentIssue.count({ where: { audience: "engineer" } });
  const customerCount = await prisma.documentIssue.count({ where: { audience: "customer" } });
  console.log(`📊 Current DB counts: engineer=${engineerCount}, customer=${customerCount}`);

  invalidateTrainingCatalogCache();
  console.log("🔄 Training catalog cache invalidated.");
}

main()
  .catch((err) => {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
