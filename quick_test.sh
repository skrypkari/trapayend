#!/bin/bash

# Автоматизированный тест системы оплаты TrapayEnd
# Запуск: ./quick_test.sh

# Конфигурация
API_BASE="https://api.trapay.uk"
PUBLIC_KEY="pk_test_your_public_key"  # Замените на реальный ключ
SHOP_ID="your-shop-id"               # Замените на реальный ID
AUTH_TOKEN="your-bearer-token"        # Замените на реальный токен
INTERNAL_API_KEY="your-internal-api-key"  # Замените на реальный ключ

echo "🧪 Starting TrapayEnd Payment System Tests"
echo "================================================"

# Тест 1: Создание платежа через MasterCard (1111)
echo "📝 Test 1: Creating MasterCard payment..."
PAYMENT_RESPONSE=$(curl -s -X POST "${API_BASE}/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "'${PUBLIC_KEY}'",
    "gateway": "1111",
    "order_id": "test_'$(date +%s)'",
    "amount": 100,
    "currency": "USD",
    "customer": "8MKTMRR4",
    "customer_email": "test@example.com",
    "customer_name": "Test Customer"
  }')

echo "Response: $PAYMENT_RESPONSE"

# Извлекаем payment ID из ответа
PAYMENT_ID=$(echo $PAYMENT_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "💳 Created payment ID: $PAYMENT_ID"
echo ""

# Тест 2: Проверка статуса платежа
if [ ! -z "$PAYMENT_ID" ]; then
  echo "📊 Test 2: Checking payment status..."
  STATUS_RESPONSE=$(curl -s -X GET "${API_BASE}/api/public/payments/${PAYMENT_ID}")
  echo "Response: $STATUS_RESPONSE"
  echo ""
fi

# Тест 3: Тест gateway permission error (должен показать ID, не имя)
echo "🚫 Test 3: Testing gateway permission error..."
PERMISSION_ERROR=$(curl -s -X POST "${API_BASE}/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_test_invalid_shop",
    "gateway": "0010",
    "amount": 50,
    "currency": "USD"
  }')

echo "Response: $PERMISSION_ERROR"
echo ""

# Тест 4: Создание платежа через Amer (0001)
echo "💳 Test 4: Creating Amer payment..."
AMER_RESPONSE=$(curl -s -X POST "${API_BASE}/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "'${PUBLIC_KEY}'",
    "gateway": "0001",
    "amount": 75,
    "currency": "USD",
    "customer_email": "amer.test@example.com"
  }')

echo "Response: $AMER_RESPONSE"

# Извлекаем Amer payment ID
AMER_ID=$(echo $AMER_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "🏦 Created Amer payment ID: $AMER_ID"
echo ""

# Тест 5: Обновление статуса через Internal API (успех с реальным gateway ID)
if [ ! -z "$PAYMENT_ID" ]; then
  echo "✅ Test 5: Updating payment status to PAID with real gateway ID..."
  UPDATE_RESPONSE=$(curl -s -X PATCH "${API_BASE}/api/internal/payments/${PAYMENT_ID}" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${INTERNAL_API_KEY}" \
    -d '{
      "status": "PAID",
      "transaction_id": "real_gateway_txn_'$(date +%s)'",
      "gateway_response": "Payment successful - automated test"
    }')
  
  echo "Response: $UPDATE_RESPONSE"
  echo ""
fi

# Тест 6: Обновление статуса с TXN ID (должен остаться FAILED)
if [ ! -z "$AMER_ID" ]; then
  echo "❌ Test 6: Updating payment status with TXN ID (should remain FAILED)..."
  TXN_RESPONSE=$(curl -s -X PATCH "${API_BASE}/api/internal/payments/${AMER_ID}" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${INTERNAL_API_KEY}" \
    -d '{
      "status": "FAILED",
      "transaction_id": "TXN_temp_'$(date +%s)'",
      "failure_message": "Card declined by bank - automated test"
    }')
  
  echo "Response: $TXN_RESPONSE"
  echo ""
fi

# Тест 7: Проверка обновленных статусов
echo "🔍 Test 7: Checking updated payment statuses..."

if [ ! -z "$PAYMENT_ID" ]; then
  echo "Checking MasterCard payment status..."
  FINAL_STATUS_1=$(curl -s -X GET "${API_BASE}/api/public/payments/${PAYMENT_ID}")
  echo "MasterCard Status: $FINAL_STATUS_1"
  echo ""
fi

if [ ! -z "$AMER_ID" ]; then
  echo "Checking Amer payment status..."
  FINAL_STATUS_2=$(curl -s -X GET "${API_BASE}/api/public/payments/${AMER_ID}")
  echo "Amer Status: $FINAL_STATUS_2"
  echo ""
fi

# Тест 8: Тест payment links
echo "🔗 Test 8: Creating payment link..."
LINK_RESPONSE=$(curl -s -X POST "${API_BASE}/api/shops/${SHOP_ID}/payment-links" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "title": "Automated Test Link",
    "description": "Testing payment link creation",
    "gateway": "1111",
    "amount": 150,
    "currency": "USD"
  }')

echo "Link Response: $LINK_RESPONSE"
echo ""

# Тест 9: Получение списка платежей магазина
echo "📋 Test 9: Getting shop payments list..."
SHOP_PAYMENTS=$(curl -s -X GET "${API_BASE}/api/shops/${SHOP_ID}/payments?page=1&limit=5" \
  -H "Authorization: Bearer ${AUTH_TOKEN}")

echo "Shop Payments: $SHOP_PAYMENTS"
echo ""

echo "🎉 Tests completed!"
echo "================================================"
echo "Summary:"
echo "- Created MasterCard payment: $PAYMENT_ID"
echo "- Created Amer payment: $AMER_ID"
echo "- Tested gateway permission errors"
echo "- Tested internal API status updates"
echo "- Tested payment links creation"
echo "- Tested shop payments retrieval"
echo ""
echo "💡 Next steps:"
echo "1. Check payment URLs in browser:"
if [ ! -z "$PAYMENT_ID" ]; then
  echo "   MasterCard: https://app.trapay.uk/payment/${PAYMENT_ID}?customer=8MKTMRR4"
fi
if [ ! -z "$AMER_ID" ]; then
  echo "   Amer: https://app.trapay.uk/payment/${AMER_ID}"
fi
echo "2. Test payment forms manually"
echo "3. Verify webhook notifications (if configured)"
echo "4. Check dashboard updates"
