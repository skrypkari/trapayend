# Улучшения для Amer Gateway Payment Form

## Проблемы, которые были исправлены:

### 1. Отсутствие amount и currency в URL
**Проблема**: URL не содержал информацию о сумме и валюте платежа
**Решение**: Добавлены параметры `amount` и `currency` в URL

### 2. Пустые поля формы
**Проблема**: Форма не заполнялась автоматически данными из URL
**Решение**: Добавлено автоматическое заполнение всех доступных полей

### 3. Изменяемая валюта
**Проблема**: Пользователь мог изменить валюту, даже если она задана в URL
**Решение**: Валюта блокируется, если передана в URL параметрах

## Изменения в коде

### 1. PaymentLinkService.ts
```typescript
// Добавлены amount и currency в URL параметры
const urlParams = new URLSearchParams();
urlParams.append('payment_id', payment.id);
urlParams.append('amount', paymentAmount.toString());
urlParams.append('currency', link.currency);
if (customerEmail) {
  urlParams.append('email', customerEmail);
}
if (customerName) {
  urlParams.append('name', customerName);
}
```

### 2. payment.php - Обработка параметров
```php
// Добавлены новые параметры
$paymentId = $_GET['payment_id'] ?? '';
$urlAmount = $_GET['amount'] ?? '';
$urlCurrency = $_GET['currency'] ?? $_GET['cur'] ?? '';
$customerEmail = $_GET['email'] ?? '';
$customerName = $_GET['name'] ?? '';
```

### 3. payment.php - Автоматическое заполнение полей

#### Cardholder Name
```php
// Автоматически заполняется из параметра name
value="<?php echo htmlspecialchars($customerName ?: $_POST['cardholderName'] ?? ''); ?>"
```

#### Currency Select
```php
// Блокируется, если передана в URL
<?php echo $urlCurrency ? 'disabled' : ''; ?>
class="... <?php echo $urlCurrency ? 'bg-gray-100' : ''; ?>"

// Добавлено скрытое поле для disabled currency
<?php if ($urlCurrency): ?>
    <input type="hidden" name="currency" value="<?php echo htmlspecialchars($urlCurrency); ?>" />
<?php endif; ?>
```

#### Заголовок страницы
```php
// Показывает сумму и валюту, если доступны
<?php if ($urlAmount && $urlCurrency): ?>
    <h2 class="text-3xl font-bold text-white mb-2"><?php echo htmlspecialchars($urlAmount . ' ' . $urlCurrency); ?></h2>
<?php else: ?>
    <h2 class="text-3xl font-bold text-white mb-2">Secure Payment</h2>
<?php endif; ?>
```

## Новый формат URL
```
https://api2.trapay.uk/payment.php?payment_id=cme8qocs8001qfc4k6xyjhfsb&amount=100&currency=USD&email=johndoe@gmail.com&name=John+Doe
```

## Результат

### ✅ Что теперь работает:
1. **Полный URL** с amount и currency
2. **Автоматическое заполнение** всех доступных полей:
   - Amount (из URL)
   - Currency (из URL, заблокирована для изменения)
   - Cardholder Name (из параметра name)
3. **Информативный заголовок** с суммой платежа
4. **Информация о клиенте** в подзаголовке
5. **Правильная передача данных** в payment_backend.php

### 🎯 UX улучшения:
- Пользователю не нужно вводить уже известные данные
- Четкое отображение суммы и валюты платежа  
- Персонализированный интерфейс с именем клиента
- Защита от случайного изменения валюты

## Файлы изменены:
1. `src/services/paymentLinkService.ts`
2. `payment/payment.php`
