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

  const templatePayload = {
    name: "service_manager_ticket_alert_v1",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text: "🔔 *New Ticket Created*\n\nA new customer service ticket has been created:\n\n📋 Ticket: {{1}}\n👤 Customer: {{2}}\n📞 Phone: {{3}}\n📍 Location: {{4}}\n🔧 Machine: {{5}}\n🛡️ Warranty: {{6}}\n📝 Complaint: {{7}}\n📎 Media: {{8}}\n\nPlease review the ticket on your Service Manager dashboard.",
        example: {
          body_text: [
            [
              "TKT-20260928-001",
              "Manu Nair",
              "+91 9048740132",
              "Kozhikode · 673001",
              "LactoSure Eco (S/N: 20240101)",
              "Active (5 months left)",
              "Vibro stirrer not vibrating",
              "1 Photo, 1 Audio note",
            ],
          ],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "View Dashboard",
            url: "https://ai.poornasreecloud.com/service-manager",
          },
        ],
      },
    ],
  };

  console.log("\n[Meta] Submitting template: service_manager_ticket_alert_v1...");
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
    // If error is about buttons in UTILITY, try without buttons
    if (createData.error.message?.includes("BUTTONS") || createData.error.error_user_msg?.includes("button")) {
      console.log("[Meta] Retrying without buttons...");
      const fallbackPayload = {
        name: "service_manager_ticket_alert_v1",
        category: "UTILITY",
        language: "en",
        components: [templatePayload.components[0]],
      };
      const retryRes = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fallbackPayload),
        }
      );
      const retryData = (await retryRes.json()) as any;
      console.log("[Meta] Retry Response:", JSON.stringify(retryData, null, 2));
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
