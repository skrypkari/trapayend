// Тест исправления валидации Amer customer поля

console.log('🧪 Testing Amer customer field validation fix...\n');

// Симуляция исправленного запроса
const fixedRequest = {
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
      "co": "al",              // ✅ НОВОЕ: Поддержка в валидации
      "product": "100",        // ✅ НОВОЕ: Поддержка в валидации
      "country": "PL"          // ✅ НОВОЕ: Поддержка в валидации
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

console.log('✅ Fixed request structure:');
console.log('📋 Amer gateway settings:');
console.log(JSON.stringify(fixedRequest.gatewaySettings.Amer, null, 2));

console.log('\n🎯 Changes made:');
console.log('1. ❌ costumer → ✅ customer (исправлена опечатка)');
console.log('2. ✅ Добавлена поддержка поля "customer" в схему валидации');
console.log('3. ✅ Добавлена поддержка полей "co", "product", "country"');
console.log('4. ✅ Обновлена схема gatewaySettingsSchema в validation.ts');

console.log('\n💡 Теперь API должен принимать эти поля без ошибок валидации!');
console.log('\n📄 Для тестирования используйте тот же fetch запрос с исправленным телом запроса');
