# Gateway 0101 - CoinToPay2 (Open Banking 2 EU + SEPA)

Этот gateway является клоном gateway 0100 (CoinToPay) с следующими изменениями:

## Основные отличия от CoinToPay (0100):

1. **Домен**: Использует `traffer.uk` вместо `tesoft.uk`
2. **Gateway ID**: `0101` вместо `0100`
3. **Внутреннее имя**: `cointopay2` вместо `cointopay`
4. **Отображаемое имя**: "Open Banking 2 (EU) + SEPA"

## Конфигурация:

### Environment переменные:
```
COINTOPAY2_MERCHANT_ID=132465
COINTOPAY2_SECURITY_CODE=ac98dbb874dcdd76085FAMnd34bIIsu98LLnhgUUd5ef7fe14257b5ccdfbc5571
```

### API endpoints:
- Создание платежа: `https://traffer.uk/gateway/cointopay/`
- Проверка статуса: `https://traffer.uk/gateway/cointopay/status.php`
- Webhook: `https://app.trapay.uk/webhooks/gateway/cointopay2`

**Важно**: API использует простые пути без .aspx файлов, аналогично оригинальному CoinToPay сервису.

## Использование:

Для создания платежа используйте gateway ID `0101`:

```json
{
  "gateway": "0101",
  "amount": 100.50,
  "currency": "EUR"
}
```

## Webhook endpoints:

- `/webhooks/gateway/cointopay2`
- `/webhooks/gateways/cointopay2/webhook`

## Мониторинг платежей:

CoinToPay2 **ПОЛНОСТЬЮ ПОДДЕРЖИВАЕТСЯ** системой мониторинга `coinToPayStatusService`:

### Автоматические проверки:
- ✅ **Индивидуальные проверки**: Расписание 1м, 2м, 7м, 12м, затем каждый час
- ✅ **Глобальная проверка**: Каждый час для всех PENDING платежей
- ✅ **Автоматическое истечение**: После 5 дней неактивности

### Поддерживаемые операции:
- ✅ Проверка статуса через `traffer.uk/gateway/cointopay/status.php`
- ✅ Обновление статуса в базе данных
- ✅ Уведомления в Telegram при изменении статуса
- ✅ Webhook уведомления для магазинов с правильным gateway ID `0101`
- ✅ Логирование всех изменений статуса

### Статус маппинг:

Аналогично CoinToPay:
- `paid`, `confirmed`, `successful` → `PAID`
- `expired`, `timeout` → `EXPIRED`  
- `failed`, `cancelled`, `error` → `FAILED`
- Все остальные → `PENDING`

## Логирование:

Все запросы и ответы логируются с префиксом `cointopay2` в системе WhiteDomain логирования.
