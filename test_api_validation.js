// Скрипт для тестирования исправленной валидации через API

const axios = require('axios');

const API_BASE = 'https://api.trapay.uk';
const USER_ID = 'cme8ooj1y001rgxyna0dmbbyl';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NTA3ODAwNSwiZXhwIjoxNzU1MTY0NDA1fQ.qPvNWK3GTv3WZ509_XpcNlDuYNnEkCQVbewyaclfLGo';

async function testAmerValidationFix() {
  console.log('🧪 Testing Amer validation fix via API...\n');

  const requestData = {
    "fullName": "nike",
    "username": "nike",
    "telegramId": "nike", 
    "merchantUrl": "https://nike",
    "gateways": ["Noda", "Rapyd", "CoinToPay2", "CoinToPay", "Amer", "Test Gateway", "Plisio", "MasterCard", "KLYME DE", "KLYME GB", "KLYME EU"],
    "status": "ACTIVE",
    "gatewaySettings": {
      "Noda": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "KLYME EU": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "KLYME GB": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "KLYME DE": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "Amer": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0,
        "customer": "8MKTMRR4",  // ✅ ИСПРАВЛЕНО: customer вместо costumer
        "co": "al",              // ✅ НОВОЕ: Добавлено в схему валидации
        "product": "100",        // ✅ НОВОЕ: Добавлено в схему валидации  
        "country": "PL"          // ✅ НОВОЕ: Добавлено в схему валидации
      },
      "MasterCard": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "Rapyd": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "CoinToPay2": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "CoinToPay": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "Test Gateway": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      },
      "Plisio": {
        "commission": 2.5,
        "minAmount": 0,
        "maxAmount": 100000,
        "payoutDelay": 0
      }
    },
    "wallets": {
      "usdtPolygonWallet": "wallet",
      "usdtTrcWallet": "wallet",
      "usdtErcWallet": "wallet", 
      "usdcPolygonWallet": "wallet"
    }
  };

  try {
    console.log('📤 Sending PUT request to update user settings...');
    console.log(`🌐 URL: ${API_BASE}/api/admin/users/${USER_ID}`);
    console.log('📋 Amer settings being sent:');
    console.log(JSON.stringify(requestData.gatewaySettings.Amer, null, 2));

    const response = await axios.put(`${API_BASE}/api/admin/users/${USER_ID}`, requestData, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log('\n✅ SUCCESS! API accepted the request');
    console.log('📥 Response status:', response.status);
    console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
    
    console.log('\n🎉 Validation fix successful!');
    console.log('✅ customer field is now accepted');
    console.log('✅ co field is now accepted');
    console.log('✅ product field is now accepted');
    console.log('✅ country field is now accepted');

  } catch (error) {
    console.log('\n❌ Request failed:');
    console.log('📥 Status:', error.response?.status);
    console.log('📄 Response:', JSON.stringify(error.response?.data, null, 2));
    
    if (error.response?.data?.details) {
      console.log('\n🔍 Validation errors:');
      error.response.data.details.forEach((detail, index) => {
        console.log(`  ${index + 1}. ${detail}`);
      });
    }

    if (error.response?.status === 400 && error.response?.data?.message === 'Validation error') {
      console.log('\n💡 If validation still fails, check:');
      console.log('1. Server restart may be needed');
      console.log('2. Check if obfuscated code is deployed');
      console.log('3. Verify schema changes are in dist-obfuscated/');
    }
  }
}

// Функция для CURL эквивалента 
function printCurlCommand() {
  console.log('\n📋 CURL equivalent command:');
  console.log(`curl -X PUT "${API_BASE}/api/admin/users/${USER_ID}" \\`);
  console.log('  -H "Accept: application/json, text/plain, */*" \\');
  console.log(`  -H "Authorization: Bearer ${AUTH_TOKEN}" \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -H "Cache-Control: no-cache" \\');
  console.log('  -d \'{"gatewaySettings":{"Amer":{"commission":2.5,"minAmount":0,"maxAmount":100000,"payoutDelay":0,"customer":"8MKTMRR4","co":"al","product":"100","country":"PL"}}}\'');
}

if (require.main === module) {
  testAmerValidationFix();
  printCurlCommand();
}
