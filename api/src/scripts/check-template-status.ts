import { loadRuntimeConfig, runtime } from "../services/runtime-config.service";

async function main() {
  await loadRuntimeConfig();
  const token = runtime.waAccessToken();
  const wabaId = runtime.waBusinessAccountId() || "1631698127950324";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=customer_support_alert_v1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const data = (await res.json()) as any;
  const template = data.data?.[0];
  if (template) {
    console.log(`STATUS: ${template.name} is ${template.status}`);
  } else {
    console.log("Template not found or error:", data);
  }
}

main().catch(console.error);
