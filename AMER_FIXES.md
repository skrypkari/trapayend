# Исправления для Amer Gateway

## Проблемы, которые были исправлены:

### 1. Validation Error в создании пользователей
**Проблема**: `"gateways[5]" must be one of [Test Gateway, Plisio, Rapyd, ...]` - Amer не был в списке разрешенных гейтвеев

**Исправление**: Добавлен "Amer" в `ALLOWED_GATEWAYS` в `src/middleware/validation.ts`

### 2. PaymentLinkService ошибка "Unsupported gateway: amer"
**Проблема**: PaymentLinkService не поддерживал gateway 'amer' в методе `initiatePaymentFromLink`

**Исправления**:
- Добавлен импорт `AmerService` в PaymentLinkService
- Добавлена инициализация `amerService` в конструкторе
- Добавлена обработка `else if (link.gateway === 'amer')` в методе `initiatePaymentFromLink`
- Добавлен `'amer': 'Amer'` в `gatewayDisplayNames` маппинг
- Обновлено сообщение об ошибке в `createPaymentLink` для включения ID 1110 (Amer)

### 3. Gateway ID vs Name проблема
**Контекст**: В API запросе используется Gateway ID "1110" в массиве gateways, но система ожидает название "Amer"

**Решение**: Система теперь корректно обрабатывает как Gateway ID, так и названия благодаря существующим helper функциям `getGatewayNameById` и `getGatewayIdByName`

## Файлы, которые были изменены:

1. **src/middleware/validation.ts**
   - Добавлен 'Amer' в `ALLOWED_GATEWAYS`

2. **src/services/paymentLinkService.ts**
   - Добавлен импорт `AmerService`
   - Добавлена инициализация сервиса
   - Добавлена поддержка gateway 'amer' в `initiatePaymentFromLink`
   - Добавлен маппинг в `getGatewayDisplayName`
   - Обновлено сообщение об ошибке в `createPaymentLink`

## Статус
✅ Все изменения реализованы и протестированы
✅ Проект компилируется без ошибок
✅ Amer gateway полностью интегрирован в систему

## Что теперь работает:
- Создание пользователей с gateway "Amer" ✅
- Создание payment links с gateway ID "1110" ✅
- Обработка платежей через Amer ✅
- Payment link инициация с gateway "amer" ✅
