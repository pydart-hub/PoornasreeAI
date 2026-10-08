import { getManagerNoticeReply } from "../services/simulate.service";

async function main() {
  console.log("=== Testing Service Manager Notice Reply ===");
  const managerReply = getManagerNoticeReply("service_manager", "Rajan Kumar");
  console.log("Message Output:\n" + managerReply.message);

  if (!managerReply.message.includes("Service Manager") || managerReply.message.includes("Service Engineer")) {
    throw new Error("❌ Manager message failed validation!");
  }
  if (!managerReply.message.includes("/service-manager")) {
    throw new Error("❌ Manager message missing dashboard link!");
  }
  console.log("✅ Service Manager reply verified!");

  console.log("\n=== Testing Assistant Service Manager Notice Reply ===");
  const asstReply = getManagerNoticeReply("assistant_service_manager", "Ananya Menon");
  console.log("Message Output:\n" + asstReply.message);

  if (!asstReply.message.includes("Assistant Service Manager")) {
    throw new Error("❌ Assistant Manager message failed validation!");
  }
  if (!asstReply.message.includes("/assistant-manager")) {
    throw new Error("❌ Assistant Manager message missing dashboard link!");
  }
  console.log("✅ Assistant Service Manager reply verified!");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
