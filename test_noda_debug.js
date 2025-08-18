const fetch = require('node-fetch');

async function testNodaAPI() {
  const apiUrl = 'https://tesoft.uk/gateway/noda/';
  
  const requestBody = {
    name: "Order ID: 12345678-87654321",
    paymentDescription: "Order ID: 12345678-87654321", 
    amount: 100,
    currency: "USD",
    paymentId: "12345678-87654321",
    webhookUrl: "https://tesoft.uk/gateway/noda/webhook/",
    returnUrl: "https://tesoft.uk/gateway/pending.php?id=12345678-87654321"
  };

  console.log('=== TESTING NODA API ===');
  console.log('URL:', apiUrl);
  console.log('Request Body:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TesSoft Payment System/1.0',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('=== RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('Raw Response:', responseText);

    if (response.ok) {
      try {
        const parsed = JSON.parse(responseText);
        console.log('Parsed Response:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('Failed to parse JSON:', e.message);
      }
    }

  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testNodaAPI();
