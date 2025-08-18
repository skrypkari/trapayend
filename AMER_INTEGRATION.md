# Amer Gateway Integration

## Описание
Интеграция платежного шлюза Amer с поддержкой MasterCard 3D Secure через api2.trapay.uk

## Архитектура

### Основные компоненты
1. **amerService.ts** - Основной сервис для работы с Amer
2. **payment_backend.php** - PHP бэкенд на api2.trapay.uk для 3D Secure
3. **internal.ts** - API роуты для межсервисного взаимодействия
4. **amer.ts** - TypeScript типы для Amer

### Поток платежа
1. Клиент создаёт платёж через основное API
2. PaymentService создаёт платежную ссылку через AmerService
3. AmerService возвращает ссылку на api2.trapay.uk
4. Клиент заполняет данные карты на api2.trapay.uk
5. PHP бэкенд обрабатывает 3D Secure
6. Результат отправляется на основное API через internal routes

### Endpoints

#### Webhook
- `POST /webhooks/amer` - Webhook от Amer
- `POST /webhooks/gateway/amer` - Альтернативный webhook

#### Internal API
- `GET /internal/payments/:id/gateway-settings` - Получение настроек шлюза
- `PATCH /internal/payments/:id/update` - Обновление статуса платежа

### Gateway Configuration
Gateway ID: `1110`
Gateway Name: `amer`

### Настройки в gatewaySettings
```json
{
  "amer": {
    "enabled": true,
    "commission": 10,
    "customer": "customer_id",
    "co": "company_code", 
    "product": "product_code",
    "country": "US"
  }
}
```

### Поддерживаемые валюты
- USD (по умолчанию)
- EUR

### Безопасность
- Internal API защищён ключом `INTERNAL_API_KEY`
- Cross-domain взаимодействие между app.trapay.uk и api2.trapay.uk
- 3D Secure аутентификация через MasterCard

### Мониторинг
- Логирование через loggerService
- Webhook события отслеживаются в админ панели
- Ошибки сохраняются в системе логов

## Развёртывание
1. Убедиться, что api2.trapay.uk настроен и доступен
2. Установить переменные окружения для internal API
3. Настроить gateway settings для магазинов
4. Проверить webhook endpoints

## Тестирование
- Использовать test gateway (ID: 0000) для отладки
- Проверить webhook delivery в админ панели
- Мониторить логи для выявления проблем
