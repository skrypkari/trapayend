# Тестовые запросы для системы оплаты TrapayEnd

## 1. Создание платежа через API

### Базовый платеж через Rapyd (ID: 0010)
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_your_public_key",
    "gateway": "0010",
    "order_id": "test_order_123",
    "amount": 100,
    "currency": "USD",
    "customer_email": "test@example.com",
    "customer_name": "Test Customer",
    "success_url": "https://yoursite.com/success",
    "fail_url": "https://yoursite.com/fail"
  }'
```

### Платеж через MasterCard (ID: 1111) с customer параметром
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_your_public_key",
    "gateway": "1111",
    "order_id": "test_mc_456",
    "amount": 50,
    "currency": "USD",
    "customer": "8MKTMRR4",
    "customer_email": "customer@example.com",
    "customer_name": "John Doe"
  }'
```

### Платеж через Amer (ID: 0001) - минимальные данные
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_your_public_key",
    "gateway": "0001",
    "amount": 25,
    "currency": "USD"
  }'
```

## 2. Проверка статуса платежа

### По внутреннему ID
```bash
curl -X GET "https://api.trapay.uk/api/public/payments/cm4rnj8sx0002qm4o3pnz9j8k"
```

### По gateway order ID (8digits-8digits формат)
```bash
curl -X GET "https://api.trapay.uk/api/public/payments/12345678-87654321"
```

### По merchant order ID
```bash
curl -X GET "https://api.trapay.uk/api/public/payments/test_order_123"
```

## 3. Тестирование payment.php с customer параметром

### Прямой доступ к платежной форме с customer
```
https://api2.trapay.uk/payment.php?id=cm4rnj8sx0002qm4o3pnz9j8k&customer=8MKTMRR4
```

### Без customer параметра
```
https://api2.trapay.uk/payment.php?id=cm4rnj8sx0002qm4o3pnz9j8k
```

## 4. Обновление статуса через Internal API

### Успешный платеж с реальным gateway ID
```bash
curl -X PATCH https://api.trapay.uk/api/internal/payments/cm4rnj8sx0002qm4o3pnz9j8k \
  -H "Content-Type: application/json" \
  -H "Authorization: your-internal-api-key" \
  -d '{
    "status": "PAID",
    "transaction_id": "real_gateway_txn_123456",
    "gateway_response": "Payment successful"
  }'
```

### Неудачный платеж с TXN ID (должен остаться FAILED, не PAID)
```bash
curl -X PATCH https://api.trapay.uk/api/internal/payments/cm4rnj8sx0002qm4o3pnz9j8k \
  -H "Content-Type: application/json" \
  -H "Authorization: your-internal-api-key" \
  -d '{
    "status": "FAILED",
    "transaction_id": "TXN_temp_789",
    "failure_message": "Card declined by bank"
  }'
```

## 5. Тестирование gateway settings validation

### Валидные настройки для Amer gateway
```bash
curl -X PUT https://api.trapay.uk/api/shops/your-shop-id/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "gatewaySettings": {
      "Amer": {
        "minAmount": 10,
        "maxAmount": 1000,
        "customer": "default_customer",
        "co": "company_code",
        "product": "product_code",
        "country": "US"
      }
    }
  }'
```

### Тест ошибки gateway permissions (должен показать gateway ID, не имя)
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_your_public_key",
    "gateway": "0010",
    "amount": 100,
    "currency": "USD"
  }'
```

## 6. Проверка безопасности gateway error messages

### Запрос с недоступным gateway (должен показать ID 0010, не "Rapyd")
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_shop_without_rapyd",
    "gateway": "0010",
    "amount": 100,
    "currency": "USD"
  }'
```

Ожидаемый ответ:
```json
{
  "error": "Gateway \"0010\" is not enabled for your shop. Enabled gateways: 0001, 1111. Please contact support to enable additional gateways."
}
```

## 7. Тестирование payment links

### Создание payment link
```bash
curl -X POST https://api.trapay.uk/api/shops/your-shop-id/payment-links \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "title": "Test Payment Link",
    "description": "Testing payment functionality",
    "gateway": "1111",
    "amount": 100,
    "currency": "USD",
    "success_url": "https://yoursite.com/success",
    "fail_url": "https://yoursite.com/fail"
  }'
```

## 8. Тестирование dashboard статусов

### Получение списка платежей магазина
```bash
curl -X GET "https://api.trapay.uk/api/shops/your-shop-id/payments?page=1&limit=10&status=PAID" \
  -H "Authorization: Bearer your-token"
```

### Получение конкретного платежа магазина
```bash
curl -X GET "https://api.trapay.uk/api/shops/your-shop-id/payments/cm4rnj8sx0002qm4o3pnz9j8k" \
  -H "Authorization: Bearer your-token"
```

## 9. Тестирование 3DS flow для Amer gateway

### Шаг 1: Создание платежа (вернет payment URL)
```bash
curl -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_your_public_key",
    "gateway": "0001",
    "amount": 100,
    "currency": "USD",
    "customer": "8MKTMRR4"
  }'
```

### Шаг 2: Заполнение формы на payment URL
```
https://app.trapay.uk/payment/{payment_id}?customer=8MKTMRR4
```

### Шаг 3: Проверка обновления статуса после 3DS
```bash
curl -X GET "https://api.trapay.uk/api/public/payments/{payment_id}"
```

## 10. Полный E2E тест

1. Создать платеж через API
2. Получить payment_url из ответа
3. Открыть payment_url в браузере
4. Заполнить форму оплаты
5. Пройти 3DS аутентификацию
6. Проверить финальный статус через API
7. Проверить webhook уведомления (если настроены)

## Примечания

- Замените `your_public_key`, `your-shop-id`, `your-token` на реальные значения
- Все gateway IDs используют новый формат: 0001, 0010, 1111 и т.д.
- Customer параметры поддерживаются для всех gateway
- Error messages теперь показывают только публичные gateway IDs
- Transaction ID логика: только реальные gateway IDs = PAID, TXN временные = FAILED/PENDING
