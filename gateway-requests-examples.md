# Примеры запросов на tesoft.uk для всех шлюзов

## 1. Plisio (Прямой API)
**URL:** `https://api.plisio.net/api/v1/invoices/new`
**Метод:** GET
**Параметры в URL:**

```
https://api.plisio.net/api/v1/invoices/new?api_key=HIDDEN&order_number=12345678-87654321&order_name=Payment%205%20USD&description=Payment%205%20USD&success_url=https%3A%2F%2Ftesoft.uk%2Fgateway%2Fsuccess.php%3Fid%3Dpayment_abc123&fail_url=https%3A%2F%2Ftesoft.uk%2Fgateway%2Ffail.php%3Fid%3Dpayment_abc123&callback_url=https%3A%2F%2Fapi.trapay.uk%2Fapi%2Fwebhooks%2Fgateway%2Fplisio&currency=USDT&source_currency=USD&source_amount=5.00&email=user%40example.com&name=John%20Doe
```

**Ответ:**
```json
{
  "status": "success",
  "data": {
    "txn_id": "685d8b7dc75d3f1417036b2e",
    "invoice_url": "https://plisio.net/invoice/685d8b7dc75d3f1417036b2e",
    "invoice_total_sum": 4.998550,
    "qr_code": "data:image/png;base64,iVBOR...",
    "qr_url": "https://plisio.net/qr/685d8b7dc75d3f1417036b2e"
  }
}
```

---

## 2. Rapyd
**URL:** `https://tesoft.uk/gateway/rapyd/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "amount": 100,
  "currency": "USD",
  "cancel_checkout_url": "https://tesoft.uk/gateway/fail.php?id=payment_abc123",
  "complete_checkout_url": "https://tesoft.uk/gateway/pending.php?id=payment_abc123",
  "complete_payment_url": "https://tesoft.uk/gateway/pending.php?id=payment_abc123",
  "merchant_reference_id": "12345678-87654321",
  "description": "ORDER: 12345678-87654321",
  "country": "GB",
  "payment_method_types_include": ["gb_visa_card", "gb_mastercard_card"],
  "custom_elements": {
    "display_description": true
  }
}
```

**Ответ:**
```json
{
  "status": {
    "error_code": "",
    "status": "SUCCESS",
    "message": "",
    "response_code": "",
    "operation_id": "12345"
  },
  "data": {
    "id": "checkout_abc123def456",
    "redirect_url": "https://checkout.rapyd.net/checkout_abc123def456",
    "amount": 100,
    "currency": "USD",
    "status": "NEW"
  }
}
```

---

## 3. Noda
**URL:** `https://tesoft.uk/gateway/noda/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "name": "Payment 100 USD",
  "paymentDescription": "Payment 100 USD",
  "amount": 100,
  "currency": "USD",
  "paymentId": "12345678-87654321",
  "webhookUrl": "https://tesoft.uk/gateways/noda/webhook/",
  "returnUrl": "https://tesoft.uk/gateway/pending.php?id=payment_abc123"
}
```

**Ответ:**
```json
{
  "id": "noda_payment_link_123",
  "name": "Payment 100 USD",
  "paymentDescription": "Payment 100 USD",
  "amount": 100,
  "currency": "USD",
  "isActive": true,
  "createdDate": "2024-01-01T12:00:00Z",
  "shortLinkUrls": {
    "shortLink": "https://pay.noda.live/abc123",
    "qrCodeLink": "https://pay.noda.live/qr/abc123"
  },
  "expiryDate": "2024-01-02T12:00:00Z"
}
```

---

## 4. CoinToPay
**URL:** `https://tesoft.uk/gateway/cointopay/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "amount": 100
}
```

**Ответ:**
```json
{
  "gateway_payment_id": "ctp_abc123def456",
  "payment_url": "https://cointopay.com/pay/ctp_abc123def456"
}
```

---

## 5. KLYME EU
**URL:** `https://tesoft.uk/gateway/klyme/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "amount": 100,
  "currency": "EUR",
  "redirectUrl": "https://tesoft.uk/gateway/pending.php?id=payment_abc123",
  "reference": "12345678-87654321",
  "geo": "EU"
}
```

**Ответ:**
```json
{
  "uuid": "klyme_eu_abc123def456",
  "redirect_url": "https://klyme.eu/pay/klyme_eu_abc123def456"
}
```

---

## 6. KLYME GB
**URL:** `https://tesoft.uk/gateway/klyme/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "amount": 100,
  "currency": "GBP",
  "redirectUrl": "https://tesoft.uk/gateway/pending.php?id=payment_abc123",
  "reference": "12345678-87654321",
  "geo": "GB"
}
```

**Ответ:**
```json
{
  "uuid": "klyme_gb_abc123def456",
  "redirect_url": "https://klyme.gb/pay/klyme_gb_abc123def456"
}
```

---

## 7. KLYME DE
**URL:** `https://tesoft.uk/gateway/klyme/`
**Метод:** POST
**Content-Type:** application/json

**Тело запроса:**
```json
{
  "amount": 100,
  "currency": "EUR",
  "redirectUrl": "https://tesoft.uk/gateway/pending.php?id=payment_abc123",
  "reference": "12345678-87654321",
  "geo": "DE"
}
```

**Ответ:**
```json
{
  "uuid": "klyme_de_abc123def456",
  "redirect_url": "https://klyme.de/pay/klyme_de_abc123def456"
}
```

---

## Общие особенности:

### 1. **URL структура для tesoft.uk:**
- **Success URL:** `https://tesoft.uk/gateway/success.php?id={payment_id}` (для Plisio, Rapyd)
- **Fail URL:** `https://tesoft.uk/gateway/fail.php?id={payment_id}` (для всех)
- **Pending URL:** `https://tesoft.uk/gateway/pending.php?id={payment_id}` (для Noda, KLYME, CoinToPay)

### 2. **Webhook URLs:**
- **Plisio:** `https://api.trapay.uk/api/webhooks/gateway/plisio`
- **Rapyd:** `https://api.trapay.uk/api/webhooks/gateway/rapyd`
- **Noda:** `https://tesoft.uk/gateways/noda/webhook/`
- **CoinToPay:** `https://api.trapay.uk/api/webhooks/gateway/cointopay`
- **KLYME:** `https://api.trapay.uk/api/webhooks/gateway/klyme`

### 3. **Gateway Order ID формат:**
Все шлюзы используют формат: `12345678-87654321` (8цифр-8цифр)

### 4. **Валюты по шлюзам:**
- **Plisio:** Любая фиатная + crypto source_currency
- **Rapyd:** USD, EUR, GBP (всегда GB как страна)
- **Noda:** USD, EUR
- **CoinToPay:** Только EUR
- **KLYME EU/DE:** Только EUR
- **KLYME GB:** Только GBP

### 5. **Логирование:**
Все запросы логируются в:
- `logs/white_domain_requests_YYYY-MM-DD.log`
- `logs/white_domain_responses_YYYY-MM-DD.log`
- `logs/white_domain_errors_YYYY-MM-DD.log`