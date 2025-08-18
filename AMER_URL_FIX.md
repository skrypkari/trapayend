# Исправление URL для Amer Gateway

## Проблема
URL для Amer gateway был неправильным:
- **Старый URL**: `https://api2.trapay.uk/payment/{id}?email=...&name=...`
- **Ошибка**: 404, так как такого роута не существует

## Решение
Изменил URL на правильный формат для payment.php:
- **Новый URL**: `https://api2.trapay.uk/payment.php?payment_id={id}&amount={amount}&currency={currency}&email=...&name=...`

## Изменения в коде

### 1. AmerService.ts
```typescript
// Было:
const paymentUrl = `${this.apiUrl}?id=${paymentId}&amount=${amount}&currency=${upperCurrency}&order=${orderId}`;

// Стало:
const paymentUrl = `${this.apiUrl}/payment.php?payment_id=${paymentId}&amount=${amount}&currency=${upperCurrency}&order=${orderId}`;
```

Также исправлен базовый URL:
```typescript
// Было:
this.apiUrl = 'https://api2.trapay.uk/payment/';

// Стало:
this.apiUrl = 'https://api2.trapay.uk';
```

### 2. PaymentLinkService.ts
```typescript
// Было:
const amerFormUrl = `https://api2.trapay.uk/payment/${payment.id}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;

// Стало:
const urlParams = new URLSearchParams();
urlParams.append('payment_id', payment.id);
if (customerEmail) urlParams.append('email', customerEmail);
if (customerName) urlParams.append('name', customerName);
const amerFormUrl = `https://api2.trapay.uk/payment.php?${urlParams.toString()}`;
```

### 3. payment.php
Добавлена обработка новых параметров:
```php
// Добавлено:
$paymentId = $_GET['payment_id'] ?? '';
$urlCurrency = $_GET['currency'] ?? $_GET['cur'] ?? '';
$customerEmail = $_GET['email'] ?? '';
$customerName = $_GET['name'] ?? '';
```

Добавлено скрытое поле в форму:
```html
<?php if ($paymentId): ?>
    <input type="hidden" name="payment_id" value="<?php echo htmlspecialchars($paymentId); ?>" />
<?php endif; ?>
```

Обновлен JavaScript для отправки payment_id:
```javascript
const paymentData = {
    payment_id: formData.get('payment_id'),
    amount: formData.get('amount'),
    // ... остальные поля
};
```

Добавлено отображение информации о клиенте в заголовке.

## Результат
✅ Теперь URL работает правильно: `https://api2.trapay.uk/payment.php?payment_id=...&amount=...&currency=...&email=...&name=...`
✅ payment.php получает все необходимые параметры
✅ payment_id передается в payment_backend.php для обработки
✅ Отображается информация о клиенте (имя/email)

## Файлы изменены:
1. `src/services/gateways/amerService.ts`
2. `src/services/paymentLinkService.ts` 
3. `payment/payment.php`
