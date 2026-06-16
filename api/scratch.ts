import axios from 'axios';

async function runTest() {
  const phone = '9999999999';
  const url = 'http://localhost:4000/api/simulate/message';

  console.log("=== RESETTING SESSION ===");
  let res = await axios.post(url, { phoneNumber: phone, message: 'menu' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.buttons) console.log('Buttons:', res.data.buttons);
  if (res.data.list) console.log('List:', res.data.list);

  console.log("\n=== SKIPPING PHONE REGISTRATION ===");
  res = await axios.post(url, { phoneNumber: phone, message: 'SKIP' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.buttons) console.log('Buttons:', res.data.buttons);
  if (res.data.list) console.log('List:', res.data.list);

  console.log("\n=== SELECTING OPTION 5 (CHANGE LANGUAGE) ===");
  res = await axios.post(url, { phoneNumber: phone, message: '5' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.buttons) console.log('Buttons:', res.data.buttons);
  if (res.data.list) console.log('List:', res.data.list);

  console.log("\n=== CHANGING LANGUAGE TO TAMIL ===");
  res = await axios.post(url, { phoneNumber: phone, message: 'LANG_TA' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.buttons) console.log('Buttons:', res.data.buttons);
  if (res.data.list) console.log('List:', res.data.list);

  console.log("\n=== CHANGING LANGUAGE TO BENGALI ===");
  // Trigger Change Language again (Option 5 in Tamil menu)
  res = await axios.post(url, { phoneNumber: phone, message: '5' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.list) console.log('List:', res.data.list);

  res = await axios.post(url, { phoneNumber: phone, message: 'LANG_BN' });
  console.log('Bot state:', res.data.state);
  console.log('Bot message:', res.data.message);
  if (res.data.buttons) console.log('Buttons:', res.data.buttons);
  if (res.data.list) console.log('List:', res.data.list);
}

runTest().catch(console.error);
