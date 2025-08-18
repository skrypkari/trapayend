// Node.js тест для быстрой проверки API
const https = require('https');

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: parsedData });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 TrapayEnd API Quick Test');
  console.log('===========================');

  // Тест 1: Создание платежа
  console.log('\n1. Creating payment with customer parameter...');
  
  const paymentData = {
    public_key: 'pk_test_demo',
    gateway: '1111',
    order_id: `test_${Date.now()}`,
    amount: 100,
    currency: 'USD',
    customer: '8MKTMRR4',
    customer_email: 'test@example.com',
    customer_name: 'Test Customer'
  };

  try {
    const response = await makeRequest({
      hostname: 'api.trapay.uk',
      port: 443,
      path: '/api/public/payments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, paymentData);

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Payment created successfully!');
      console.log('Payment ID:', response.data.id);
      console.log('Payment URL:', response.data.payment_url);
      
      const paymentId = response.data.id;
      
      // Тест 2: Проверка статуса
      console.log('\n2. Checking payment status...');
      const statusResponse = await makeRequest({
        hostname: 'api.trapay.uk',
        port: 443,
        path: `/api/public/payments/${paymentId}`,
        method: 'GET'
      });

      if (statusResponse.status === 200) {
        console.log('✅ Status check successful!');
        console.log('Status:', statusResponse.data.status);
        console.log('Gateway:', statusResponse.data.gateway);
        console.log('Customer:', statusResponse.data.rapyd_customer);
        
        console.log('\n🔗 Test URLs:');
        console.log(`Basic: https://app.trapay.uk/payment/${paymentId}`);
        console.log(`With customer: https://app.trapay.uk/payment/${paymentId}?customer=8MKTMRR4`);
        console.log(`Direct form: https://api2.trapay.uk/payment.php?id=${paymentId}&customer=8MKTMRR4`);
      }
      
    } else {
      console.log('❌ Payment creation failed');
      console.log('Status:', response.status);
      console.log('Response:', response.data);
    }
  } catch (error) {
    console.log('❌ Payment creation error:', error.message);
  }

  // Тест 3: Gateway permission error
  console.log('\n3. Testing gateway permission error...');
  
  try {
    const errorResponse = await makeRequest({
      hostname: 'api.trapay.uk',
      port: 443,
      path: '/api/public/payments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      public_key: 'pk_test_invalid_shop',
      gateway: '0010',
      amount: 100,
      currency: 'USD'
    });

    console.log('Gateway error response:', errorResponse.data);
    
    const errorMessage = errorResponse.data.error || errorResponse.data.message || JSON.stringify(errorResponse.data);
    if (errorMessage.includes('0010')) {
      console.log('✅ Security test passed: Gateway ID shown instead of name');
    } else if (errorMessage.includes('Rapyd')) {
      console.log('⚠️  Security issue: Gateway name exposed instead of ID');
    } else {
      console.log('ℹ️  Unexpected error format:', errorMessage);
    }
    
  } catch (error) {
    console.log('Gateway permission test error:', error.message);
  }

  console.log('\n🎯 Test completed!');
  console.log('\n💡 Next steps:');
  console.log('1. Test payment forms manually using the URLs above');
  console.log('2. Fill test card: 4111111111111111, 12/25, 123');
  console.log('3. Complete 3DS authentication');
  console.log('4. Check status updates in dashboard');
}

runTests().catch(console.error);
