// ── Standalone Seeder for 21 Engineer Training Videos ─────────────────────
// Run: cd api && npx ts-node src/scripts/seed-training-videos.ts

import prisma from "../lib/prisma";
import { DEFAULT_21_TRAINING_VIDEOS } from "../controllers/engineer-training-video.controller";

async function main() {
  console.log("Seeding 21 Engineer Training Videos...");

  const existingCount = await prisma.engineerTrainingVideo.count();
  console.log(`Current video count in database: ${existingCount}`);

  for (const v of DEFAULT_21_TRAINING_VIDEOS) {
    const existing = await prisma.engineerTrainingVideo.findFirst({
      where: { title: v.title },
    });

    if (existing) {
      console.log(`- Skipping existing: "${v.title}"`);
    } else {
      await prisma.engineerTrainingVideo.create({
        data: {
          title: v.title,
          topic: v.topic,
          description: v.description,
          youtubeUrl: v.youtubeUrl,
        },
      });
      console.log(`+ Seeded: "${v.title}" (${v.topic})`);
    }
  }

  const finalCount = await prisma.engineerTrainingVideo.count();
  console.log(`\nSuccessfully finished! Total training videos in database: ${finalCount}`);
}

main()
  .catch((e) => {
    console.error("Error seeding training videos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
