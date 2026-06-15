const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.resolve(__dirname, ".env") });

const WA_BUSINESS_ACCOUNT_ID = process.env.WA_BUSINESS_ACCOUNT_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;

if (!WA_BUSINESS_ACCOUNT_ID || !WA_ACCESS_TOKEN) {
  console.error("Error: WA_BUSINESS_ACCOUNT_ID or WA_ACCESS_TOKEN not found in .env");
  process.exit(1);
}

async function listTemplates() {
  const url = `https://graph.facebook.com/v21.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates?limit=100`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
      },
    });
    
    if (!res.ok) {
      const err = await res.json();
      console.error("Meta API returned error:", JSON.stringify(err, null, 2));
      return;
    }
    
    const body = await res.json();
    const templates = body.data || [];
    
    console.log(`\nFound ${templates.length} templates in your account:\n`);
    templates.forEach((t) => {
      console.log(`----------------------------------------`);
      console.log(`Name:   ${t.name}`);
      console.log(`Lang:   ${t.language}`);
      console.log(`Status: ${t.status}`);
      console.log(`Category: ${t.category}`);
      
      const bodyComponent = t.components?.find((c) => c.type === "BODY");
      if (bodyComponent?.text) {
        console.log(`Text:\n${bodyComponent.text}\n`);
      }
      
      const buttonsComponent = t.components?.find((c) => c.type === "BUTTONS");
      if (buttonsComponent?.buttons) {
        console.log("Buttons:");
        buttonsComponent.buttons.forEach((btn, idx) => {
          console.log(`  [${idx}] ${btn.type} - "${btn.text}" (${btn.url || ''})`);
        });
      }
    });
    console.log(`----------------------------------------`);
  } catch (err) {
    console.error("Network error fetching templates:", err.message);
  }
}

listTemplates();
