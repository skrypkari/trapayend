#!/bin/bash

# Быстрый тест API для проверки текущего состояния
echo "🔥 Quick API Status Test"
echo "======================="

# Тест 1: Проверка API здоровья
echo "1. Testing API health..."
curl -s https://api.trapay.uk/health || echo "API health check failed"
echo ""

# Тест 2: Создание простого платежа
echo "2. Creating test payment..."
RESPONSE=$(curl -s -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_demo",
    "gateway": "1111",
    "amount": 10,
    "currency": "USD"
  }')

echo "Response: $RESPONSE"

# Извлекаем ID из ответа
PAYMENT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ ! -z "$PAYMENT_ID" ]; then
  echo "✅ Payment created: $PAYMENT_ID"
  echo "🔗 Payment URL: https://app.trapay.uk/payment/$PAYMENT_ID"
else
  echo "❌ Payment creation failed"
fi
echo ""

# Тест 3: Проверка gateway error messages
echo "3. Testing gateway permission error (should show ID, not name)..."
ERROR_RESPONSE=$(curl -s -X POST https://api.trapay.uk/api/public/payments \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_invalid",
    "gateway": "0010",
    "amount": 100,
    "currency": "USD"
  }')

echo "Error Response: $ERROR_RESPONSE"
echo ""

# Тест 4: Проверка статуса созданного платежа
if [ ! -z "$PAYMENT_ID" ]; then
  echo "4. Checking payment status..."
  STATUS=$(curl -s https://api.trapay.uk/api/public/payments/$PAYMENT_ID)
  echo "Status Response: $STATUS"
fi

echo ""
echo "🎯 Test Summary:"
echo "- API connectivity: $(curl -s -o /dev/null -w "%{http_code}" https://api.trapay.uk/health)"
echo "- Payment creation: $([ ! -z "$PAYMENT_ID" ] && echo "SUCCESS" || echo "FAILED")"
echo "- Gateway errors: $(echo $ERROR_RESPONSE | grep -q '"0010"' && echo "SECURE (shows ID)" || echo "EXPOSED (shows name)")"
