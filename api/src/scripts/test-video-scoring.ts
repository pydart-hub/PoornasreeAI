import { scoreVideoMatch } from "../controllers/video.controller";

const testCases = [
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
];

console.log("=== RUNNING VIDEO SCORING UNIT TESTS ===");
let passed = 0;
for (const tc of testCases) {
  const score = scoreVideoMatch(tc.q, tc.title, tc.kw);
  const ok = score >= 12;
  if (ok) passed++;
  console.log(`${ok ? "✅" : "❌"} Query: "${tc.q}" -> Score: ${score} on "${tc.title}"`);
}

console.log(`\nResult: ${passed}/${testCases.length} tests passed.`);
process.exit(passed === testCases.length ? 0 : 1);
