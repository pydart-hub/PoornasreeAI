import { searchTrainingVideos } from './src/services/engineer-training-video.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log("=== query: printor ===");
  const res1 = await searchTrainingVideos("printor");
  console.log(res1.map(v => v.title));

  console.log("\n=== query: display settings ===");
  const res2 = await searchTrainingVideos("display settings");
  console.log(res2.map(v => v.title));

  console.log("\n=== query: printer and display ===");
  const res3 = await searchTrainingVideos("printer and display");
  console.log(res3.map(v => v.title));

  await prisma.$disconnect();
}

run().catch(console.error);
