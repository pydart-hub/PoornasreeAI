import prisma from "../lib/prisma";

async function deleteAllTickets() {
  console.log("Deleting all tickets from database...");
  const result = await prisma.ticket.deleteMany({});
  console.log(`Successfully deleted ${result.count} ticket(s) from database.`);
}

deleteAllTickets()
  .catch((e) => {
    console.error("Failed to delete tickets:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
