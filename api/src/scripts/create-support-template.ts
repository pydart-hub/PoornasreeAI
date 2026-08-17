import { loadRuntimeConfig, runtime } from "../services/runtime-config.service";

async function main() {
  await loadRuntimeConfig();

  const token = runtime.waAccessToken();
  const wabaId = runtime.waBusinessAccountId() || "1631698127950324";
  console.log(`[Meta] WABA ID: ${wabaId}`);

  if (!token) {
    console.error("WA_ACCESS_TOKEN is missing!");
    process.exit(1);
  }

  // 1. Check existing templates
  console.log("\n[Meta] Fetching existing message templates...");
  const listRes = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const listData = (await listRes.json()) as any;

  if (listData.error) {
    console.error("[Meta] Error listing templates:", listData.error);
  } else if (listData.data) {
    console.log(`Found ${listData.data.length} templates:`);
    listData.data.forEach((t: any) => {
      console.log(` - ${t.name} [status: ${t.status}, category: ${t.category}, lang: ${t.language}]`);
    });
  }

  // 2. Submit customer_support_alert_v1
  const templatePayload = {
    name: "customer_support_alert_v1",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "🚨 *Customer Support Request*\n\nHey Support Team, a customer is waiting for you on the support dashboard!\n\n👤 Customer: {{1}}\n📱 Phone: {{2}}\n⏰ Time: {{3}}\n\n👉 Please check your dashboard: https://ai.poornasreecloud.com/support-dashboard",
        example: {
          body_text: [["Abhishek", "9048740132", "03:45 PM IST"]],
        },
      },
    ],
  };

  console.log("\n[Meta] Requesting new template: customer_support_alert_v1...");
  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(templatePayload),
    }
  );

  const createData = (await createRes.json()) as any;
  console.log("[Meta] Response:", JSON.stringify(createData, null, 2));

  if (createData.id) {
    console.log(`\n🎉 Template successfully created with ID: ${createData.id} (Status: ${createData.status})`);
  } else if (createData.error) {
    console.log(`\n⚠️ Meta API response: ${createData.error.message}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
