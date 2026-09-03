import { getLiveMetaTemplateStatuses, getAudienceContacts, PROMOTION_TEMPLATES } from "../src/services/promotion.service";

async function main() {
  console.log("-----------------------------------------");
  console.log("PROMOTIONS SERVICE VERIFICATION TEST");
  console.log("-----------------------------------------");

  console.log(`Total Templates in Catalogue: ${PROMOTION_TEMPLATES.length}`);
  const statuses = await getLiveMetaTemplateStatuses();

  let approvedCount = 0;
  for (const t of PROMOTION_TEMPLATES) {
    const status = statuses[t.name]?.status || "NOT_SUBMITTED";
    const id = statuses[t.name]?.id || "N/A";
    if (status === "APPROVED") approvedCount++;
    console.log(`- ${t.name.padEnd(32)}: [${status}] (ID: ${id})`);
  }
  console.log(`\nMeta Approved Count: ${approvedCount} / ${PROMOTION_TEMPLATES.length}`);

  const audience = await getAudienceContacts("all");
  console.log("\nAudience Counts:");
  console.log(`  All:        ${audience.counts.all}`);
  console.log(`  Engineers:  ${audience.counts.engineers}`);
  console.log(`  Customers:  ${audience.counts.customers}`);
  console.log(`  Dealers:    ${audience.counts.dealers}`);
  console.log(`  Leads:      ${audience.counts.leads}`);

  if (audience.contacts.length > 0) {
    console.log(`\nSample Contact: ${audience.contacts[0].name} (${audience.contacts[0].phone}, ${audience.contacts[0].category})`);
  }
  console.log("-----------------------------------------");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
