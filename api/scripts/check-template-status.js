const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const token = process.env.WA_ACCESS_TOKEN;
const waba = process.env.WA_BUSINESS_ACCOUNT_ID || "1631698127950324";
const name = process.argv[2] || "engineer_ticket_assigned";

fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates?limit=100`, {
  headers: { Authorization: `Bearer ${token}` },
})
  .then((r) => r.json())
  .then((j) => {
    const t = (j.data || []).find((x) => x.name === name);
    if (t) {
      console.log(JSON.stringify({ name: t.name, status: t.status, language: t.language, id: t.id }, null, 2));
    } else {
      console.log(`Template "${name}" not found`);
      if (j.error) console.log(JSON.stringify(j.error, null, 2));
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
