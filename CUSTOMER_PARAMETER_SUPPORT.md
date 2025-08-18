# Customer Parameter Support in Payment URLs

## Описание
Добавлена поддержка параметра `customer` в URL ссылки для оплаты, который позволяет переопределить настройки customer для конкретного платежа.

## Приоритет настроек Customer

1. **URL параметр** (высший приоритет) - `customer` из URL
2. **Настройки шлюза** - из `gatewaySettings.amer.customer` 
3. **Дефолтное значение** - `P3653E62`

## Примеры использования

### Базовая ссылка (без custom customer):
```
https://api2.trapay.uk/payment.php?payment_id=cme8si8w5001q33l3k1utxw6s&amount=5&currency=EUR
```
→ Использует customer из настроек шлюза или дефолтное значение

### Ссылка с custom customer:
```
https://api2.trapay.uk/payment.php?payment_id=cme8si8w5001q33l3k1utxw6s&amount=5&currency=EUR&customer=8MKTMRR4
```
→ Использует `8MKTMRR4` независимо от настроек

### Полная ссылка с автозаполнением и custom customer:
```
https://api2.trapay.uk/payment.php?payment_id=cme8si8w5001q33l3k1utxw6s&amount=5&currency=EUR&email=johndoe%40gmail.com&name=John+Doe&customer=8MKTMRR4
```

## Все поддерживаемые параметры URL:

| Параметр | Описание | Обязательный | Пример |
|----------|----------|--------------|---------|
| `payment_id` | ID платежа из БД | ✅ Да | `cme8si8w5001q33l3k1utxw6s` |
| `amount` | Сумма платежа | ✅ Да | `5` |
| `currency` | Валюта (EUR/USD/CAD) | ✅ Да | `EUR` |
| `email` | Email для автозаполнения | ❌ Нет | `johndoe%40gmail.com` |
| `name` | Имя для автозаполнения | ❌ Нет | `John+Doe` |
| `customer` | Custom customer ID | ❌ Нет | `8MKTMRR4` |

## Как это работает

### 1. В `payment.php`:
- Извлекается параметр `customer` из URL: `$urlCustomer = $_GET['customer'] ?? '';`
- Добавляется скрытое поле в форму: `<input type="hidden" name="customer" value="..." />`
- Передается в JavaScript: `customer: formData.get('customer')`

### 2. В `payment_backend.php`:
- Извлекается из запроса: `$customCustomer = $requestData['paymentData']['customer'] ?? null`
- Передается в конструктор: `new PaymentProcessor($paymentId, $customCustomer)`
- Применяется с приоритетом над настройками шлюза

### 3. Логирование:
```
Loading payment settings for payment ID: cme8si8w5001q33l3k1utxw6s
Found custom customer in paymentData: 8MKTMRR4
Using custom customer from URL (priority): 8MKTMRR4
Loaded settings - customer: 8MKTMRR4, co: al, product: 100
```

## Применение

Это полезно для:
- **Мультитенантности** - разные customer ID для разных клиентов
- **A/B тестирования** - тестирование разных процессинговых аккаунтов
- **Переопределения** - временное использование другого customer без изменения настроек
- **Отладки** - быстрое переключение между тестовыми аккаунтами

## Безопасность

- Параметр проходит через `htmlspecialchars()` для предотвращения XSS
- Валидируется на стороне payment gateway API
- Логируется для аудита действий

## Обратная совместимость

✅ Полностью совместимо с существующими ссылками - если параметр `customer` не передан, используется стандартная логика приоритета.
