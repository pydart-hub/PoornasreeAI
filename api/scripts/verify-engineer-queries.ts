import { handleMessage } from "../src/services/simulate.service";

const ENGINEER_QUERIES = [
  { name: "1. VIBRO NOT WORKING / LOW VIBRATION", query: "Vibro low vibration" },
  { name: "2. FARMER DETAILS NOT SHOWN (ECOD-DPST)", query: "Farmer details not shown" },
  { name: "3. ANALYZER MAINBOARD REPAIR", query: "Analyzer not on" },
  { name: "4. T2 ERROR SAMPLE SUCKING", query: "T2 error" },
  { name: "5. RATE CHART NOT VIEW", query: "Rate not taking from chart" },
];

async function runEngineerVerifications() {
  console.log("================================================================================");
  console.log("👷 VERIFYING SERVICE ENGINEER TROUBLESHOOTING QUERIES (Phone: 917909110006 - Saiprakash)");
  console.log("================================================================================\n");

  const engineerPhone = "917909110006"; // Saiprakash (Registered Service Engineer)

  for (const item of ENGINEER_QUERIES) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`📌 TEST: ${item.name}`);
    console.log(`💬 ENGINEER QUERY: "${item.query}"`);

    try {
      const res = await handleMessage(engineerPhone, item.query);
      console.log(`\n🤖 BOT RESPONSE:\n${res.message}\n`);
    } catch (err) {
      console.error(`❌ ERROR: ${(err as Error).message}`);
    }
  }
}

runEngineerVerifications().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
