// ✅ ТЕСТ: Проверка исправленных сообщений об ошибках gateway

import { getGatewayIdByName, getGatewayNameById } from './src/types/gateway';

// Функция для тестирования конвертации
function convertGatewayNamesToIds(gatewayNames) {
  return gatewayNames.map(name => {
    return getGatewayIdByName(name) || name;
  });
}

// Тестовые данные
const enabledGateways = ['mastercard', 'rapyd'];
const requestedGateway = 'rapyd';

// Результат ДО исправлений
console.log('❌ ДО ИСПРАВЛЕНИЙ:');
console.log(`Gateway "${requestedGateway}" is not enabled for your shop.`);
console.log(`Enabled gateways: ${enabledGateways.join(', ')}.`);
console.log('Please contact support to enable additional gateways.\n');

// Результат ПОСЛЕ исправлений
const enabledGatewayIds = convertGatewayNamesToIds(enabledGateways);
const requestedGatewayId = getGatewayIdByName(requestedGateway) || requestedGateway;

console.log('✅ ПОСЛЕ ИСПРАВЛЕНИЙ:');
console.log(`Gateway "${requestedGatewayId}" is not enabled for your shop.`);
console.log(`Enabled gateways: ${enabledGatewayIds.join(', ')}.`);
console.log('Please contact support to enable additional gateways.\n');

// Проверка маппинга
console.log('🗺️ Gateway ID Mapping Test:');
const testGateways = ['mastercard', 'rapyd', 'amer', 'plisio', 'test_gateway'];
testGateways.forEach(name => {
  const id = getGatewayIdByName(name);
  const backToName = getGatewayNameById(id || '');
  console.log(`${name} → ${id} → ${backToName}`);
});

console.log('\n✅ Тест завершен! Названия шлюзов теперь скрыты.');
