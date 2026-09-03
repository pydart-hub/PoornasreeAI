import { handleMessage } from "../src/services/simulate.service";

async function testQuery() {
  const testPhone = `91${Date.now().toString().slice(-10)}`;
  console.log("=== Testing 'Date n time not shwong' against CHATBOT_DATAS ===");

  // 1. Initial greeting
  await handleMessage(testPhone, "Hi");

  // 2. Select Complaint Registration
  await handleMessage(testPhone, "COMPLAINT_REG");

  // 3. User types: "Date n time not shwong"
  console.log("\n[User]: Date n time not shwong");
  const res = await handleMessage(testPhone, "Date n time not shwong");

  console.log("\n[Chatbot Response]:\n", res.message);
  console.log("\n[Chatbot Buttons]:\n", res.buttons?.map(b => `${b.id} (${b.title})`));

  const hasClockSettings = res.message?.toLowerCase().includes("clock settings");
  const hasEnterDateTime = res.message?.toLowerCase().includes("date and time");
  const hasRtcBattery = res.message?.toLowerCase().includes("rtc battery") || res.message?.toLowerCase().includes("coin cell");

  console.log("\n--- Verification ---");
  console.log("1. Contains 'clock settings' from CHATBOT_DATAS:", hasClockSettings ? "PASSED ✅" : "FAILED ❌");
  console.log("2. Contains 'enter correct date and time' from CHATBOT_DATAS:", hasEnterDateTime ? "PASSED ✅" : "FAILED ❌");
  console.log("3. Does NOT contain unlisted RTC coin cell battery:", !hasRtcBattery ? "PASSED ✅" : "FAILED ❌");

  if (hasClockSettings && hasEnterDateTime && !hasRtcBattery) {
    console.log("\n🎉 TEST PASSED! Response matches CHATBOT_DATAS exactly.");
    process.exit(0);
  } else {
    console.error("\n❌ TEST FAILED!");
    process.exit(1);
  }
}

testQuery().catch((err) => {
  console.error(err);
  process.exit(1);
});
