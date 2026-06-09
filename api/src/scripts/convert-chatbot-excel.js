/**
 * convert-chatbot-excel.js
 * Reads data/training/CHATBOT_DATAS.xlsx (USER CHAT sheet) and outputs
 * data/training/chatbot-training.json in the { intents: [...] } format
 * used by training-indexer.ts.
 *
 * Run: node api/src/scripts/convert-chatbot-excel.js
 */

const XLSX = require("xlsx");
const path = require("path");
const fs   = require("fs");

const ROOT      = path.resolve(__dirname, "../../..");
const EXCEL_IN  = path.join(ROOT, "data/training/CHATBOT_DATAS.xlsx");
const JSON_OUT  = path.join(ROOT, "data/training/chatbot-training.json");

// Natural-language pattern generator per product+complaint
function buildPatterns(product, complaint) {
  const p = toTitle(product);
  const c = complaint.trim();
  const cLow = c.toLowerCase();

  // Always include the raw complaint and product+complaint combo
  const patterns = [
    c,                                          // "LOW VIBRATION"
    `${p} - ${c}`,                              // "Vibro - LOW VIBRATION"
    `${p} ${cLow}`,                             // "Vibro low vibration"
  ];

  // Add question forms based on common keywords
  if (/not (work|on|show|detect|print|send)/i.test(c)) {
    patterns.push(`Why is my ${p} ${cLow}?`);
    patterns.push(`My ${p} is ${cLow}`);
  } else if (/error|shown/i.test(c)) {
    patterns.push(`${p} showing ${cLow}`);
    patterns.push(`${p} ${cLow} problem`);
  } else if (/not present|not (correct|saved)/i.test(c)) {
    patterns.push(`${p} ${cLow} issue`);
  } else {
    patterns.push(`My ${p} has ${cLow} issue`);
    patterns.push(`Problem with ${p}: ${cLow}`);
  }

  // Deduplicate and return
  return [...new Set(patterns)];
}

// Build a step-by-step response string from CHECK/ACTION columns
function buildResponse(product, complaint, pairs) {
  const lines = [`Here's how to troubleshoot your ${toTitle(product)} — ${toTitle(complaint)}:`];
  let stepNum = 1;

  for (const { check, action } of pairs) {
    // If CHECK itself is the contact-care sentinel, stop
    if (/contact customer care/i.test(check)) {
      lines.push(`${stepNum}. If none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
      break;
    }
    // If ACTION is the contact-care sentinel, include the check step first then stop
    if (/contact customer care/i.test(action)) {
      if (check) {
        lines.push(`${stepNum}. ${toTitle(check)}`);
        stepNum++;
      }
      lines.push(`${stepNum}. If none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
      break;
    }
    if (check && action) {
      lines.push(`${stepNum}. Check: ${toTitle(check)} → ${toTitle(action)}`);
      stepNum++;
    } else if (check) {
      lines.push(`${stepNum}. ${toTitle(check)}`);
      stepNum++;
    }
  }

  return lines.join("\n");
}

// Convert a slug-safe tag string
function toTag(product, complaint) {
  const slug = (s) => s.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `chatbot_${slug(product)}_${slug(complaint)}`;
}

function toTitle(str) {
  if (!str) return "";
  // Keep all-caps abbreviations as-is; title-case normal words
  return str.replace(/\w\S*/g, (word) => {
    if (word === word.toUpperCase() && word.length > 2) return word; // e.g. USB, GSM, LED
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

const wb   = XLSX.readFile(EXCEL_IN);
const ws   = wb.Sheets["USER CHAT"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

const intents = [];
const seenTags = new Set();
let lastProduct = "";
let skipped = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length === 0) continue;

  // Fill-down product column
  if (row[1] && String(row[1]).trim()) {
    lastProduct = String(row[1]).trim();
  }

  const complaint = row[2] ? String(row[2]).trim() : "";
  if (!complaint) { skipped++; continue; }

  // Skip footnote/description rows (no product context)
  if (!lastProduct) { skipped++; continue; }

  // Build CHECK/ACTION pairs from columns 3 onwards
  const pairs = [];
  for (let col = 3; col < row.length; col += 2) {
    const check  = row[col]   ? String(row[col]).trim()   : "";
    const action = row[col+1] ? String(row[col+1]).trim() : "";

    if (!check && !action) continue;

    // "TO CONTACT CUSTOMER CARE" as the check value → sentinel, stop
    if (/contact customer care/i.test(check)) {
      pairs.push({ check: "TO CONTACT CUSTOMER CARE", action: "" });
      break;
    }
    // "TO CONTACT CUSTOMER CARE" as the action → keep the check, then sentinel
    if (/contact customer care/i.test(action)) {
      if (check) pairs.push({ check, action: "" });   // real check step
      pairs.push({ check: "TO CONTACT CUSTOMER CARE", action: "" });
      break;
    }
    pairs.push({ check, action });
  }

  if (pairs.length === 0) { skipped++; continue; }

  const tag = toTag(lastProduct, complaint);

  // Skip duplicate tags (rare merged/sub-rows)
  if (seenTags.has(tag)) { skipped++; continue; }
  seenTags.add(tag);

  intents.push({
    tag,
    role: "customer",
    patterns: buildPatterns(lastProduct, complaint),
    responses: [ buildResponse(lastProduct, complaint, pairs) ],
  });
}

// Write output
const output = JSON.stringify({ intents }, null, 2);
fs.writeFileSync(JSON_OUT, output, "utf-8");

console.log(`\n✓ Generated: ${JSON_OUT}`);
console.log(`  Intents  : ${intents.length}`);
console.log(`  Skipped  : ${skipped} rows (blank/notes/duplicates)`);
console.log("\nSample intents:");
intents.slice(0, 3).forEach(intent => {
  console.log(`\n  [${intent.tag}]`);
  console.log(`  Patterns : ${intent.patterns.slice(0,2).join(" | ")}`);
  console.log(`  Response : ${intent.responses[0].slice(0, 120)}...`);
});
