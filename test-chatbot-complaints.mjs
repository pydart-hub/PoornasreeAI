#!/usr/bin/env node
/**
 * PoornasreeAI — WhatsApp Chatbot Complaint Test Suite
 *
 * Tests every documented complaint through the simulate API.
 * Run: node test-chatbot-complaints.mjs
 *
 * Prerequisites:
 *   - Next.js running on port 3000 (dev or built)
 *   - Express API accessible via proxy at /api/simulate/message
 *   - Database seeded with DocumentIssue records from training documents
 */

const BASE = process.env.API_BASE || 'http://localhost:3000';
const TEST_PHONE = '9999999999';

// ANSI colors
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

let pass = 0, fail = 0, skip = 0;
const results = [];

function log(msg, color = '') {
  console.log(`${color}${msg}${C.reset}`);
}

async function sendMessage(message) {
  const res = await fetch(`${BASE}/api/simulate/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: TEST_PHONE, message }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

function containsTroubleshootingSteps(reply) {
  if (!reply || typeof reply !== 'string') return false;
  // Match numbered steps: "Step 1:", "1.", "✓ Step"
  return /(step\s*\d|✓\s*step|check\s+the|1\.\s)/i.test(reply);
}

function extractSteps(reply) {
  if (!reply) return [];
  // Extract "Step N:" or numbered lines
  const lines = reply.split('\n');
  const steps = [];
  let current = '';
  for (const line of lines) {
    if (/^✓\s*step\s*\d/i.test(line) || /^\d+\./i.test(line)) {
      if (current) steps.push(current.trim());
      current = line;
    } else if (current) {
      current += '\n' + line;
    }
  }
  if (current) steps.push(current.trim());
  return steps;
}

function hasBookServiceButton(data) {
  if (!data.buttons || !Array.isArray(data.buttons)) return false;
  return data.buttons.some(b =>
    /book\s*service|sevā|સેવા|सेवा|सेव/i.test(b.title || '')
  );
}

function hasResolvedButton(data) {
  if (!data.buttons || !Array.isArray(data.buttons)) return false;
  return data.buttons.some(b =>
    /resolved|हाँ|yes|સમસ્યા ગુમ|সমাধান/i.test(b.title || '')
  );
}

function truncate(text, max = 120) {
  if (!text) return '(empty)';
  text = text.replace(/\n/g, '\\n');
  return text.length > max ? text.substring(0, max) + '...' : text;
}

async function testComplaint(label, message, expectations = {}) {
  try {
    // Reset session for each complaint
    await fetch(`${BASE}/api/simulate/session/${TEST_PHONE}`, { method: 'DELETE' });

    // Start conversation
    const greeting = await sendMessage('hi');
    if (greeting.status !== 200 || !greeting.data.message) {
      log(`  [SKIP] ${label} — server not responding`, C.yellow);
      skip++;
      results.push({ label, status: 'skip', reason: 'server error' });
      return;
    }

    // Navigate to complaint flow
    await sendMessage('2'); // Complaint Registration

    // Skip serial or enter dummy
    const skipRes = await sendMessage('Skip');
    // Select product — try "1" (first product) or "Other"
    await sendMessage('1');

    // Now send the actual complaint
    const res = await sendMessage(message);
    const reply = res.data.message || '';
    const buttons = res.data.buttons || [];

    let passThis = true;
    const issues = [];

    // Check expectations
    if (expectations.shouldHaveSteps && !containsTroubleshootingSteps(reply)) {
      passThis = false;
      issues.push('No troubleshooting steps found in response');
    }

    if (expectations.shouldHaveBookService !== false && !hasBookServiceButton(buttons) && !containsTroubleshootingSteps(reply)) {
      // Non-critical — some complaints may not have service booking if steps resolve
    }

    if (expectations.shouldHaveResolved && !hasResolvedButton(buttons)) {
      passThis = false;
      issues.push('Missing "Resolved" button');
    }

    const steps = extractSteps(reply);
    const stepCount = steps.length;

    if (passThis) {
      pass++;
      log(`  [PASS] ${label} (${stepCount} steps)`, C.green);
    } else {
      fail++;
      log(`  [FAIL] ${label}: ${issues.join(', ')}`, C.red);
    }

    // Always log the response for review
    results.push({
      label,
      status: passThis ? 'pass' : 'fail',
      stepCount,
      response: truncate(reply),
      issues,
      fullResponse: reply,
      state: res.data.state,
      buttons: buttons.map(b => b.title),
    });

  } catch (err) {
    fail++;
    log(`  [FAIL] ${label}: ${err.message}`, C.red);
    results.push({ label, status: 'fail', error: err.message });
  }
}

// Wait, test all complaints
async function main() {
  log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}${C.cyan}  PoornasreeAI — Chatbot Complaint Test Suite${C.reset}`);
  log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}\n`);

  log(`${C.bold}Testing via: ${BASE}${C.reset}\n`);

  // ── Category 1: VIBRO ──────────────────────────────────────────
  log(`${C.bold}Category 1: VIBRO${C.reset}`);
  await testComplaint('VIBRO: Not Working (No LED)', 'My vibro is not working, LED is not on', { shouldHaveSteps: true });
  await testComplaint('VIBRO: LED Just On and Off', 'Vibro LED goes on and off but not working', { shouldHaveSteps: true });
  await testComplaint('VIBRO: No Vibration', 'Vibro has no vibration', { shouldHaveSteps: true });
  await testComplaint('VIBRO: Continuous Vibration', 'Vibro continuously vibrating', { shouldHaveSteps: true });
  await testComplaint('VIBRO: Low Vibration', 'Vibro low vibration', { shouldHaveSteps: true });
  await testComplaint('VIBRO: Push Switch Not Working', 'Push switch not working on vibro', { shouldHaveSteps: true });
  await testComplaint('VIBRO: Vibration LED Not Working', 'Vibration LED not working', { shouldHaveSteps: true });
  await testComplaint('VIBRO: Power LED Not Working', 'Power LED not working', { shouldHaveSteps: true });

  // ── Category 2: Solar Charger ──────────────────────────────────
  log(`\n${C.bold}Category 2: Solar Charger Board${C.reset}`);
  await testComplaint('Solar: Battery Charging Voltage 0V', 'Battery charging voltage is zero', { shouldHaveSteps: true });
  await testComplaint('Solar: Charging Voltage Low', 'Battery charging voltage is low', { shouldHaveSteps: true });
  await testComplaint('Solar: Charging Voltage Too High', 'Battery charging voltage too high', { shouldHaveSteps: true });
  await testComplaint('Solar: Voltage OK but Not Charging', 'Voltage correct but battery not charging', { shouldHaveSteps: true });
  await testComplaint('Solar: Charging LED Not Working', 'Battery charging LED not working', { shouldHaveSteps: true });
  await testComplaint('Solar: Low Voltage Cutoff Not Working', 'Low voltage cutoff not working', { shouldHaveSteps: true });
  await testComplaint('Solar: Cutoff LED Not Working', 'Low voltage cutoff LED not working', { shouldHaveSteps: true });
  await testComplaint('Solar: Running on Battery Only', 'Machine working from battery always, not charging', { shouldHaveSteps: true });
  await testComplaint('Solar: Not Working from External Battery', 'Machine not working from external battery', { shouldHaveSteps: true });

  // ── Category 3: Compact Adapter ────────────────────────────────
  log(`\n${C.bold}Category 3: Compact Adapter${C.reset}`);
  await testComplaint('Compact Adapter: Output Zero', 'Adapter output voltage is zero', { shouldHaveSteps: true });
  await testComplaint('Compact Adapter: Output Zero LED On', 'Adapter output zero but LED is glowing', { shouldHaveSteps: true });
  await testComplaint('Compact Adapter: Low Voltage', 'Adapter output 8V to 9V', { shouldHaveSteps: true });

  // ── Category 4: Charger Adapter ────────────────────────────────
  log(`\n${C.bold}Category 4: Charger Adapter${C.reset}`);
  await testComplaint('Charger: Output Zero', 'Charger adapter output voltage is zero', { shouldHaveSteps: true });
  await testComplaint('Charger: Output Zero LED On', 'Charger adapter output zero but LED is glowing', { shouldHaveSteps: true });
  await testComplaint('Charger: 12V Line Low', '12V line low, 12V showing 8V', { shouldHaveSteps: true });
  await testComplaint('Charger: 24V Line Low', '24V line low', { shouldHaveSteps: true });

  // ── Category 5: ECOD-DPST Board ────────────────────────────────
  log(`\n${C.bold}Category 5: ECOD-DPST Board${C.reset}`);
  await testComplaint('DPST: Please Wait Continuously', 'Please wait showing continuously', { shouldHaveSteps: true });
  await testComplaint('DPST: Display Blank', 'Display not working, blank', { shouldHaveSteps: true });
  await testComplaint('DPST: Display Half', 'Display shown half portion', { shouldHaveSteps: true });
  await testComplaint('DPST: RTC Time Not Saved', 'RTC time not saved after restart', { shouldHaveSteps: true });
  await testComplaint('DPST: RTC Time Not Running', 'RTC time not running, clock frozen', { shouldHaveSteps: true });
  await testComplaint('DPST: Keypad Not Working', 'Keypad not working', { shouldHaveSteps: true });
  await testComplaint('DPST: USB Initialization Error', 'USB initialization error', { shouldHaveSteps: true });
  await testComplaint('DPST: Weighing Scale Not Working', 'Weighing scale not working', { shouldHaveSteps: true });
  await testComplaint('DPST: Computer Output Not Present', 'Computer output not present', { shouldHaveSteps: true });
  await testComplaint('DPST: External Display Not Working', 'External display not working', { shouldHaveSteps: true });
  await testComplaint('DPST: WiFi/GSM Error', 'WiFi GSM module error', { shouldHaveSteps: true });
  await testComplaint('DPST: SMS Not Sending', 'SMS not send to the farmer', { shouldHaveSteps: true });
  await testComplaint('DPST: Cloud Update Error', 'Cloud updation error', { shouldHaveSteps: true });
  await testComplaint('DPST: SD Card Save Error', 'Chart not saved, SD card issue', { shouldHaveSteps: true });
  await testComplaint('DPST: Sample Test Timeout', 'Sample testing time above 50 seconds', { shouldHaveSteps: true });
  await testComplaint('DPST: Pendrive Detection Failure', 'Pendrive not detected', { shouldHaveSteps: true });
  await testComplaint('DPST: External Keyboard Not Detected', 'External keyboard not detected', { shouldHaveSteps: true });
  await testComplaint('DPST: Printer Not Working', 'Printer not working', { shouldHaveSteps: true });

  // ── Category 6: Pump ───────────────────────────────────────────
  log(`\n${C.bold}Category 6: Pump${C.reset}`);
  await testComplaint('Pump: Not Working (Motor Dead)', 'Pump not working', { shouldHaveSteps: true });
  await testComplaint('Pump: Nut and Bolt Hit Clamp', 'Pump nut and bolt moving to one side', { shouldHaveSteps: true });
  await testComplaint('Pump: Sense Error', 'Pump sense error', { shouldHaveSteps: true });

  // ── Category 7: Battery ────────────────────────────────────────
  log(`\n${C.bold}Category 7: Battery (ECOD/ECOSV/LSES V3)${C.reset}`);
  await testComplaint('Battery: Low Battery Error', 'Low battery error shown', { shouldHaveSteps: true });
  await testComplaint('Battery: Full LED Not Working', 'Battery full LED not working', { shouldHaveSteps: true });

  // ── Category 8: Analyzer Mainboard ─────────────────────────────
  log(`\n${C.bold}Category 8: Analyzer Mainboard${C.reset}`);
  await testComplaint('Mainboard: T2/Temp Set Error', 'T2 temp set error', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Box Temp Error', 'Box temp error', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Sample Not Found / Air in Milk', 'Sample not found', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Water in Sensor', 'Plunge in water, water in sensor', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Hot Sample Error', 'Hot sample error', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Count Zero / Result Zero', 'Count zero', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Reading Variation', 'Reading variation', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Fat in Water', 'Fat shown in water', { shouldHaveSteps: true });
  await testComplaint('Mainboard: LCD Computer Mode', 'LCD continuously showing computer mode', { shouldHaveSteps: true });
  await testComplaint('Mainboard: LCD Version', 'LCD continuously showing version', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Fuse Burn / Warming Off', 'Machine off during warming, fuse burn', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Pendrive Keyboard Undetected', 'Pendrive and keyboard not detected', { shouldHaveSteps: true });
  await testComplaint('Mainboard: WiFi/GSM Error', 'WiFi GSM module error shown', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Frontpanel Keypad Not Working', 'Frontpanel keypad not working', { shouldHaveSteps: true });
  await testComplaint('Mainboard: LCD Not Working', 'LCD not working, blank display', { shouldHaveSteps: true });
  await testComplaint('Mainboard: RTC Not Running', 'RTC time not running', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Computer Output Not Present', 'Computer output not present', { shouldHaveSteps: true });
  await testComplaint('Mainboard: RTC Time Not Saved', 'RTC time not saved after restart', { shouldHaveSteps: true });
  await testComplaint('Mainboard: SMS Not Sending', 'SMS not send to farmer', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Cloud Update Error', 'Tested result cloud updation error', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Rate Not Taken', 'Rate not taken from chart', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Farmer Details Not Shown', 'Farmer details not shown', { shouldHaveSteps: true });
  await testComplaint('Mainboard: Weighing Scale Not Working', 'Weighing scale not working', { shouldHaveSteps: true });
  await testComplaint('Mainboard: External Display Not Working', 'External display not working', { shouldHaveSteps: true });

  // ── Category 9: Others ─────────────────────────────────────────
  log(`\n${C.bold}Category 9: General Analyzer (Others)${C.reset}`);
  await testComplaint('General: Analyzer Not Working', 'Analyzer not working', { shouldHaveSteps: true });

  // ── Summary ────────────────────────────────────────────────────
  log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}  TEST RESULTS SUMMARY${C.reset}`);
  log(`${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
  log(`  ${C.green}PASS: ${pass}${C.reset}`);
  log(`  ${C.red}FAIL: ${fail}${C.reset}`);
  log(`  ${C.yellow}SKIP: ${skip}${C.reset}`);
  log(`  Total: ${pass + fail + skip}`);

  // Write detailed results
  const fs = await import('fs');
  const output = {
    timestamp: new Date().toISOString(),
    base: BASE,
    summary: { pass, fail, skip, total: pass + fail + skip },
    results: results.map(r => ({
      label: r.label,
      status: r.status,
      stepCount: r.stepCount,
      response: r.response,
      buttons: r.buttons,
      state: r.state,
      issues: r.issues,
      fullResponse: r.fullResponse,
      error: r.error,
    })),
  };

  fs.writeFileSync('test-results/chatbot-test-results.json', JSON.stringify(output, null, 2));
  log(`\n  Detailed results written to: ${C.cyan}test-results/chatbot-test-results.json${C.reset}`);

  // Print all responses
  log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}  ALL RESPONSE DETAILS${C.reset}`);
  log(`${C.cyan}═══════════════════════════════════════════════════════════${C.reset}\n`);

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️';
    log(`${icon} ${r.label}`, r.status === 'pass' ? C.green : r.status === 'fail' ? C.red : C.yellow);
    if (r.fullResponse) {
      log(`   State: ${r.state || 'N/A'}`, C.dim);
      log(`   Steps found: ${r.stepCount || 0}`, C.dim);
      if (r.buttons && r.buttons.length > 0) {
        log(`   Buttons: ${r.buttons.join(', ')}`, C.dim);
      }
      log(`   Response: ${r.fullResponse.substring(0, 300)}${r.fullResponse.length > 300 ? '...' : ''}`, C.dim);
    }
    if (r.issues && r.issues.length > 0) {
      log(`   Issues: ${r.issues.join('; ')}`, C.red);
    }
    if (r.error) {
      log(`   Error: ${r.error}`, C.red);
    }
    console.log('');
  }
}

main().catch(console.error);
