# MasterCard Payment URLs с параметрами

## Описание изменения

Для MasterCard платежей (gateway ID: 1111) теперь в URL редиректа автоматически добавляются параметры email и имени клиента, если они были переданы в запросе.

## Примеры URL

### С email и именем:
```
https://app.trapay.uk/payment/12345?email=john%40example.com&name=John+Doe
```

### Только с email:
```
https://app.trapay.uk/payment/12345?email=john%40example.com
```

### Без параметров:
```
https://app.trapay.uk/payment/12345
```

## Где применяется

1. **PaymentService.createPublicPayment()** - при создании обычных платежей
2. **PaymentLinkService.initiatePaymentFromLink()** - при создании платежей через payment links

## Исходные данные

- **email**: берется из `customer_email` (PaymentService) или `customerEmail` (PaymentLinkService)
- **name**: берется из `customer_name` (PaymentService) или `customerName` (PaymentLinkService)

## Логирование

В логах будет видно:
```
📧 URL параметры: email=john%40example.com&name=John+Doe
```

## Совместимость

- ✅ Параметры добавляются только для MasterCard gateway (1111)
- ✅ Если email/name отсутствуют - URL остается без параметров
- ✅ Параметры правильно URL-кодируются
- ✅ Обратная совместимость сохранена
