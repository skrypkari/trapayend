# Обновление статуса для Amer Gateway

## ✅ Статус обновляется правильно!

### 🔄 Поток обновления статуса:

#### 1. Обработка платежа на api2.trapay.uk
- Пользователь заполняет форму на `payment.php`
- Данные отправляются на `payment_backend.php`
- Происходит обработка 3D Secure через MasterCard API

#### 2. Успешный платеж → Обновление в основной БД
```php
// payment_backend.php
$this->updatePaymentInMainDB($this->paymentId, [
    'status' => 'PAID',
    'gateway_payment_id' => $transactionId,
    'card_last4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4),
    'payment_method' => 'card',
    'paid_at' => date('Y-m-d H:i:s'),
    'gateway_response' => json_encode($result)
]);
```

#### 3. Internal API принимает обновление
```typescript
// internal.ts - PATCH /internal/payments/:id/update
router.patch('/payments/:id/update', verifyInternalApiKey, async (req, res) => {
  // Обновляет статус в основной БД
  const updatedPayment = await prisma.payment.update({
    where: { id },
    data: filteredUpdateData
  });
})
```

#### 4. Уведомление мерчанта (добавлено)
После обновления статуса на PAID отправляется webhook мерчанту.

## 🛡️ Безопасность
- Internal API защищён ключом `internal-api-key`
- Только разрешенные поля могут быть обновлены
- Валидация всех входящих данных

## 📡 Webhook endpoints для Amer
```
POST /webhooks/gateway/amer
POST /webhooks/amer  
POST /webhooks/gateways/amer/webhook
```

## 🧪 Как проверить обновление статуса:

### 1. Создать payment link с Amer gateway
```bash
# Через админ панель или API
POST /api/payment-links
{
  "gateway": "1110",
  "amount": 100,
  "currency": "USD"
}
```

### 2. Открыть ссылку и совершить платеж
```
https://api2.trapay.uk/payment.php?payment_id=xxx&amount=100&currency=USD
```

### 3. Заполнить тестовые данные карты
```
Card Number: 5555555555554444 (MasterCard)
Expiry: 12/25
CVV: 123
Name: Test User
```

### 4. Проверить статус в админ панели
Статус должен измениться с `PENDING` на `PAID`

## 🔍 Логи для отладки:
- `payment_backend.php` логирует успешные платежи
- Internal API логирует все обновления
- WebhookService логирует отправку уведомлений мерчанту
- AdminService показывает статистику платежей

## ✅ Что работает:
1. ✅ Создание платежа с Amer gateway
2. ✅ Обработка платежа через 3D Secure
3. ✅ Обновление статуса через Internal API
4. ✅ Уведомление мерчанта через webhook
5. ✅ Отображение в админ панели
6. ✅ Обновление статистики

## 🚀 Дополнительные проверки:
- Проверить логи в админ панели
- Убедиться, что webhook дошёл до мерчанта
- Проверить обновление баланса (если включено)
- Проверить комиссию gateway
