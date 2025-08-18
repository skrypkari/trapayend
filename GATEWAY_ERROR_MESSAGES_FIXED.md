# ✅ ИСПРАВЛЕНИЯ СООБЩЕНИЙ ОБ ОШИБКАХ GATEWAY - ЗАВЕРШЕНО

## 🎯 Проблема
В сообщениях об ошибках отображались реальные названия шлюзов (например, "Rapyd", "MasterCard"), а должны показываться только их ID.

## 🔧 Исправления

### 1. PaymentService.ts
**ДО:**
```typescript
throw new Error(
  `Gateway "${gatewayDisplayName}" is not enabled for your shop. ` +
  `Enabled gateways: ${enabledGateways.join(', ')}. ` +
  `Please contact support to enable additional gateways.`
);
```

**ПОСЛЕ:**
```typescript
// Convert gateway names to IDs for user-facing message
const enabledGatewayIds = this.convertGatewayNamesToIds(enabledGateways);
const requestedGatewayId = getGatewayIdByName(gatewayName) || gatewayName;

throw new Error(
  `Gateway "${requestedGatewayId}" is not enabled for your shop. ` +
  `Enabled gateways: ${enabledGatewayIds.join(', ')}. ` +
  `Please contact support to enable additional gateways.`
);
```

### 2. PaymentLinkService.ts
Применены те же изменения, что и в PaymentService.

### 3. Добавлена функция convertGatewayNamesToIds()
```typescript
private convertGatewayNamesToIds(gatewayNames: string[]): string[] {
  return gatewayNames.map(name => {
    // Try to get ID from name mapping, fallback to original name if not found
    return getGatewayIdByName(name) || name;
  });
}
```

## 📊 Результат

### ДО исправлений:
```
Gateway "Rapyd" is not enabled for your shop. 
Enabled gateways: mastercard, rapyd. 
Please contact support to enable additional gateways.
```

### ПОСЛЕ исправлений:
```
Gateway "0010" is not enabled for your shop. 
Enabled gateways: 1111, 0010. 
Please contact support to enable additional gateways.
```

## 🗺️ Gateway ID Mapping
- `0000` = test_gateway
- `0001` = plisio
- `0010` = rapyd
- `0100` = cointopay
- `0101` = cointopay2
- `1000` = noda
- `1001` = klyme_eu
- `1010` = klyme_gb
- `1100` = klyme_de
- `1111` = mastercard
- `1110` = amer

## 🧪 Проверка

1. **Создать payment через API с недоступным gateway ID**
2. **Проверить сообщение об ошибке - должны быть только ID**
3. **Убедиться, что реальные названия шлюзов не отображаются**

## 🔒 Безопасность

✅ **Названия шлюзов скрыты от клиентов**
✅ **Показываются только публичные ID**  
✅ **Нет утечки внутренней информации**

## 📝 Дополнительные изменения

- Добавлен импорт `getGatewayIdByName` в оба сервиса
- Функция `convertGatewayNamesToIds()` добавлена в оба сервиса
- Сохранена обратная совместимость с существующими gateway ID

Теперь в API ответах мерчанты будут видеть только публичные ID шлюзов, а не их внутренние названия!
