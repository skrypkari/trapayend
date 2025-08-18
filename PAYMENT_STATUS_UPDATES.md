# Payment Status Updates - Fixed

## Проблема
При неуспешном завершении 3DS верификации или других ошибках платежа, статус в базе данных не обновлялся, оставаясь в статусе PENDING. Это приводило к тому, что в личном кабинете пользователь не видел изменения статуса платежа.

## Решение
Добавлено автоматическое обновление статуса платежа на FAILED во всех случаях ошибок:

### 1. Обновлен класс PaymentProcessor
- Сделано публичным свойство `$paymentId` для доступа из внешних catch блоков
- Сделан публичным метод `updatePaymentInMainDB()` для внешнего доступа

### 2. Добавлено извлечение payment_id из запроса
```php
// Extract payment_id from request for database updates
$paymentId = null;
if (isset($requestData['paymentData']['payment_id'])) {
    $paymentId = $requestData['paymentData']['payment_id'];
} elseif (isset($requestData['payment_id'])) {
    $paymentId = $requestData['payment_id'];
}

$processor = new PaymentProcessor($paymentId);
```

### 3. Обновлен метод process3DSVerification()
- Добавлено извлечение `payment_id` из `paymentData`
- В catch блоке добавлено обновление статуса на FAILED при ошибках 3DS верификации

### 4. Обновлен метод processAuth()
- В catch блоке добавлено обновление статуса на FAILED при ошибках аутентификации

### 5. Обновлен основной catch блок
- Добавлено обновление статуса на FAILED при любых общих ошибках обработки платежа

## Что происходит теперь при ошибках

### При ошибке 3DS верификации:
```php
// Обновляем статус платежа на FAILED при ошибке
if ($this->paymentId) {
    $this->updatePaymentInMainDB($this->paymentId, [
        'status' => 'FAILED',
        'gateway_response' => json_encode([
            'error' => $e->getMessage(),
            'step' => '3ds_verification',
            'timestamp' => date('Y-m-d H:i:s')
        ])
    ]);
}
```

### При ошибке аутентификации:
```php
// Обновляем статус платежа на FAILED при ошибке аутентификации
if ($this->paymentId) {
    $this->updatePaymentInMainDB($this->paymentId, [
        'status' => 'FAILED',
        'gateway_response' => json_encode([
            'error' => $e->getMessage(),
            'step' => 'auth_processing',
            'timestamp' => date('Y-m-d H:i:s')
        ])
    ]);
}
```

### При общих ошибках:
```php
// Обновляем статус платежа на FAILED при общих ошибках
if (isset($processor) && $processor->paymentId) {
    $processor->updatePaymentInMainDB($processor->paymentId, [
        'status' => 'FAILED',
        'gateway_response' => json_encode([
            'error' => $e->getMessage(),
            'step' => 'general_processing',
            'timestamp' => date('Y-m-d H:i:s')
        ])
    ]);
}
```

## Результат
✅ Теперь при любой ошибке платежа:
1. Статус в базе данных обновляется на FAILED
2. Сохраняется подробная информация об ошибке в gateway_response
3. Указывается шаг процесса, на котором произошла ошибка
4. Пользователь видит обновленный статус в личном кабинете
5. Внутренний API уведомляет мерчанта через webhook о неудачном платеже

## Тестирование
После применения этих изменений, статус платежа будет корректно обновляться при всех типах ошибок, включая:
- Ошибки 3DS верификации ("Final payment failed: null")
- Ошибки аутентификации
- Ошибки валидации
- Сетевые ошибки API
- Любые другие исключения
