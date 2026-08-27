import { handleMessage } from "../src/services/simulate.service";

const ALL_CUSTOMER_COMPLAINTS = [
  { name: "1. VIBRO NOT WORKING", query: "Vibro not working" },
  { name: "2. VIBRO CONTINUOUSLY VIBRATING", query: "Vibro machine continuously vibrating" },
  { name: "3. VIBRO LOW VIBRATION", query: "Vibro low vibration" },
  { name: "4. COMPACT ADAPTER VOLTAGE NILL", query: "Compact adapter output voltage is nill" },
  { name: "5. CHARGER ADAPTER VOLTAGE NILL", query: "Charger adapter output voltage is nill" },
  { name: "6. ANALYZER NOT ON", query: "Analyzer not on" },
  { name: "7. LOW BATTERY ERROR", query: "Low battery error shown" },
  { name: "8. T2 / TEMP SET / AIR IN MILK", query: "T2 error" },
  { name: "9. PLUNGE IN WATER / WATER IN SENSOR", query: "Water in sensor" },
  { name: "10. HOT SAMPLE ERROR", query: "Hot sample error" },
  { name: "11. PENDRIVE KEYBOARD NOT DETECTED", query: "Pen drive and keyboard not detected" },
  { name: "12. WIFI GSM ERROR", query: "Wifi gsm error shown" },
  { name: "13. DATE AND TIME NOT CORRECT", query: "Date and time not shown correct" },
  { name: "14. COMPUTER OUTPUT NOT PRESENT", query: "Computer output not present" },
  { name: "15. EXTERNAL DISPLAY NOT SHOWING RESULT", query: "External display not showing the result" },
  { name: "16. FAT SHOWN IN WATER", query: "Fat shown in water" },
  { name: "17. READING VARIATION", query: "Reading variation" },
  { name: "18. SMS NOT SEND TO FARMER", query: "SMS not send to the farmer" },
  { name: "19. FARMER DETAILS NOT SHOWN", query: "Farmer details not shown" },
  { name: "20. PRINTER NOT PRINTING", query: "Printer is not print" },
  { name: "21. WEIGHING SCALE NOT WORKING", query: "Weighing scale not working" },
  { name: "22. RATE CHART NOT VIEW / NOT TAKEN", query: "Rate not taking from chart" },
  { name: "23. CLOUD UPDATION ERROR", query: "Tested result to cloud updation error shown" },
];

async function runAllVerifications() {
  console.log("================================================================================");
  console.log("🧪 VERIFYING ALL 23 OFFICIAL CUSTOMER COMPLAINTS AGAINST TRAINING DOCUMENTS");
  console.log("================================================================================\n");

  const results: { name: string; query: string; passed: boolean; issues: string[]; sample: string }[] = [];

  for (const item of ALL_CUSTOMER_COMPLAINTS) {
    const testPhone = `9179990000${results.length.toString().padStart(2, "0")}`;
    process.stdout.write(`Testing [${item.name}] ... `);

    try {
      // 1. Skip registration prompt to place session in active mode
      await handleMessage(testPhone, "SKIP");

      // 2. Send the actual customer complaint query
      const res = await handleMessage(testPhone, item.query);
      const text = res.message || "";
      const issues: string[] = [];

      // Verification checks:
      if (!text.includes("Step 1:") && !text.includes("Step 1 :")) issues.push("Missing Step 1");
      if (!text.includes("Check 1:") && !text.includes("Check 1 :")) issues.push("Missing Check 1");
      if (!text.includes("Action 1:") && !text.includes("Action 1 :")) issues.push("Missing Action 1");

      // Check for ALL CAPS (more than 70% uppercase in letters)
      const letters = text.replace(/[^a-zA-Z]/g, "");
      const upperLetters = (text.match(/[A-Z]/g) || []).length;
      if (letters.length > 0 && (upperLetters / letters.length) > 0.65) {
        issues.push("Full ALL-CAPS detected");
      }

      // Check for duplicate remarks
      if (text.includes("↳ Remark: CHECK THE POWER SUPPLY") && text.includes("Check 2: Check the power supply")) {
        issues.push("Duplicate leaked remark detected");
      }

      const passed = issues.length === 0;
      results.push({ name: item.name, query: item.query, passed, issues, sample: text });

      if (passed) {
        console.log("✅ PASSED");
      } else {
        console.log(`❌ FAILED: ${issues.join(", ")}`);
      }
    } catch (err) {
      console.log(`❌ ERROR: ${(err as Error).message}`);
      results.push({ name: item.name, query: item.query, passed: false, issues: [(err as Error).message], sample: "" });
    }
  }

  console.log("\n================================================================================");
  console.log(`📊 VERIFICATION SUMMARY: ${results.filter(r => r.passed).length} / ${results.length} PASSED`);
  console.log("================================================================================\n");

  for (const r of results) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`📌 COMPLAINT: ${r.name}`);
    console.log(`💬 USER QUERY: "${r.query}"`);
    console.log(`STATUS: ${r.passed ? "✅ PASSED" : "❌ FAILED (" + r.issues.join(", ") + ")"}`);
    console.log(`BOT RESPONSE:\n${r.sample}`);
  }
}

runAllVerifications().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e); process.exit(1); });
