import axios from 'axios';

async function testSimulate() {
  const phone = '9999999991';
  const url = 'https://ai.poornasreecloud.com/api/simulate/message';

  // 1. Send hi
  let res = await axios.post(url, { phoneNumber: phone, message: 'hi' });
  console.log('Bot:', res.data.message);

  // 2. Select language (1 for English)
  res = await axios.post(url, { phoneNumber: phone, message: '1' });
  console.log('Bot:', res.data.message);

  // 3. Register complaint (1)
  res = await axios.post(url, { phoneNumber: phone, message: '1' });
  console.log('Bot:', res.data.message);

  // 4. Enter serial number
  res = await axios.post(url, { phoneNumber: phone, message: 'SN123456789' });
  console.log('Bot:', res.data.message);

  // 5. Provide machine manually since not found -> enter product name
  res = await axios.post(url, { phoneNumber: phone, message: 'ECO V3' });
  console.log('Bot:', res.data.message);
  if (res.data.interactive) {
    console.log('Interactive:', JSON.stringify(res.data.interactive, null, 2));
  }
}

testSimulate().catch(console.error);
