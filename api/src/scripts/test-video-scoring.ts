import { scoreVideoMatch } from "../controllers/video.controller";

const positiveTestCases = [
  { q: "vibro not working", title: "Stirrer ON but Not Vibrating", kw: "stirrer on but not vibrating | lactosure & lactogrand troubleshooting" },
  { q: "stirrer not vibrating", title: "Stirrer ON but Not Vibrating", kw: "stirrer on but not vibrating | lactosure & lactogrand troubleshooting" },
  { q: "printer paper blank", title: "Printer Paper Coming Out Blank", kw: "printer paper coming out blank | lactosure & lactogrand troubleshooting" },
  { q: "printer is not print", title: "Printer Paper Coming Out Blank", kw: "printer paper coming out blank | lactosure & lactogrand troubleshooting" },
  { q: "t2 error", title: "T2 Error Troubleshooting", kw: "t2 error troubleshooting | lactosure & lactogrand milk analyzer" },
  { q: "water in sensor", title: "Water in Sensor", kw: "water in sensor | lactosure & lactogrand milk analyzer" },
  { q: "hot sample error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "sample not found", title: "Sample Not Found", kw: "sample not found | lactosure & lactogrand troubleshooting" },
  { q: "water zero calibration", title: "Water Zero Calibration", kw: "in skip navigation search create 9+ avatar image water zero calibration | lactosure & lactogrand milk analyzer" },
  { q: "wifi range not showing", title: "WiFi Range Not Showing?", kw: "wifi range not showing? | lactosure & lactogrand milk analyzers" },
  { q: "sample is hot", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "milk is too hot", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
];

const negativeRejectionCases = [
  { q: "keypad error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "display error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "sensor error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "reading error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "analyzer error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "machine error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "system error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "sample not taking", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "sample not sucking", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "milk sample error", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
  { q: "error in milk", title: "Hot Sample Error", kw: "hot sample error | lactosure & lactogrand troubleshooting" },
];

console.log("=== RUNNING VIDEO SCORING UNIT TESTS ===");
let passed = 0;
const total = positiveTestCases.length + negativeRejectionCases.length;

console.log("\n--- Positive Match Tests (Expected Score >= 30) ---");
for (const tc of positiveTestCases) {
  const score = scoreVideoMatch(tc.q, tc.title, tc.kw);
  const ok = score >= 30;
  if (ok) passed++;
  console.log(`${ok ? "✅" : "❌"} Query: "${tc.q}" -> Score: ${score} on "${tc.title}"`);
}

console.log("\n--- Negative Rejection Tests (Expected Score < 30 / 0 on Hot Sample Error) ---");
for (const tc of negativeRejectionCases) {
  const score = scoreVideoMatch(tc.q, tc.title, tc.kw);
  const ok = score < 30;
  if (ok) passed++;
  console.log(`${ok ? "✅ REJECTED" : "❌ FALSE POSITIVE"} Query: "${tc.q}" -> Score: ${score} on "${tc.title}"`);
}

console.log(`\nResult: ${passed}/${total} tests passed.`);
process.exit(passed === total ? 0 : 1);

