/**
 * Local dev webhook catcher for Poornasree ticket events.
 * Run: node scripts/webhook-receiver.js
 * Set in api/.env: INTEGRATION_WEBHOOK_URL=http://127.0.0.1:9090/webhook
 */
const http = require("http");

const PORT = Number(process.env.WEBHOOK_PORT) || 9090;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "POST /webhook only" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const t = payload.data;
      console.log("\n--- webhook ---");
      console.log("event:", payload.event);
      console.log("stage:", payload.stage, "| ticket:", t?.ticketNumber);
      console.log("customer:", t?.customer?.name, t?.customer?.phone);
      console.log("complaint:", t?.complaint?.problemDescription?.slice(0, 80));
      console.log("sentAt:", payload.sentAt);
    } catch {
      console.log("\n--- webhook (raw) ---\n", body.slice(0, 500));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Webhook receiver: http://127.0.0.1:${PORT}/webhook`);
  console.log(`Set INTEGRATION_WEBHOOK_URL=http://127.0.0.1:${PORT}/webhook in api/.env`);
});
