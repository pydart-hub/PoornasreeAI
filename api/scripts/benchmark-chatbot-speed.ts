import * as SimulateService from "../src/services/simulate.service";
import prisma from "../src/lib/prisma";

async function runBenchmark() {
  console.log("==================================================");
  console.log("STARTING CHATBOT LATENCY & RESPONSE BENCHMARK");
  console.log("==================================================");

  const testPhone = "919999988888";

  // Test 1: First Greeting / Small Talk ("Hi")
  console.log("\n[Test 1] Testing Greeting / Small Talk ('Hi')...");
  const t0 = Date.now();
  const res1 = await SimulateService.handleMessage(testPhone, "Hi");
  const elapsed1 = Date.now() - t0;
  console.log(`Response Time: ${elapsed1}ms`);
  console.log(`Reply Preview: ${res1.message?.slice(0, 120)}...`);

  // Test 2: Troubleshooting Query ("T2 error")
  console.log("\n[Test 2] Testing Technical Troubleshooting ('T2 error')...");
  const t1 = Date.now();
  const res2 = await SimulateService.handleMessage(testPhone, "T2 error");
  const elapsed2 = Date.now() - t1;
  console.log(`Response Time: ${elapsed2}ms`);
  console.log(`Reply Preview: ${res2.message?.slice(0, 150)}...`);
  console.log(`Buttons returned:`, res2.buttons?.map(b => b.title) || "None");

  // Test 3: Malayalam Greeting ("Sugam ano")
  console.log("\n[Test 3] Testing Malayalam Friendly Greeting ('Sugam ano')...");
  const t2 = Date.now();
  const res3 = await SimulateService.handleMessage(testPhone, "Sugam ano");
  const elapsed3 = Date.now() - t2;
  console.log(`Response Time: ${elapsed3}ms`);
  console.log(`Reply Preview: ${res3.message?.slice(0, 120)}...`);

  console.log("\n==================================================");
  console.log(`BENCHMARK SUMMARY:`);
  console.log(`- Greeting Latency: ${elapsed1}ms`);
  console.log(`- Troubleshooting Latency: ${elapsed2}ms`);
  console.log(`- Multilingual Latency: ${elapsed3}ms`);
  console.log("==================================================");

  await prisma.$disconnect();
}

runBenchmark().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
