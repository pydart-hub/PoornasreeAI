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

async function createTemplate() {
  const url = `https://graph.facebook.com/v21.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates`;
  
  const payload = {
    name: "poornasree_engineer_activation_v2",
    category: "UTILITY",
    allow_category_change: true,
    language: "en",
    components: [
      {
        type: "BODY",
        text: "Welcome to Poornasree Service Team, {{1}}!\n\nYou have been registered as a Service Engineer by {{2}}.\n\nComplete your registration by opening the link below:\n{{3}}\n\nLogin email: {{4}}\n\nThank you! 🙏",
        example: {
          body_text: [
            [
              "Mhd Ijaz",
              "Rajesh Kumar",
              "https://ai.poornasreecloud.com/set-password?token=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
              "ijaz@company.com"
            ]
          ]
        }
      }
    ]
  };

  try {
    console.log("Creating template in Meta...");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    const body = await res.json();
    if (!res.ok) {
      console.error("Meta API rejected template creation:", JSON.stringify(body, null, 2));
      return;
    }
    
    console.log("Template created successfully!");
    console.log("Response:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("Network error creating template:", err.message);
  }
}

createTemplate();
