#!/bin/bash

# Простой bash-скрипт для тестирования исправленного API
echo "🧪 Тестирование исправленного Internal API"
echo "=========================================="

PAYMENT_ID="cme8si8w5001q33l3k1utxw6s"
API_URL="https://api.trapay.uk/api/internal/payments"
API_KEY="internal-api-key"

echo "💡 Payment ID: $PAYMENT_ID"
echo ""

# Test 1: Простое обновление статуса
echo "🔄 TEST 1: Simple status update"
echo "Sending: {\"status\":\"PENDING\"}"
RESULT1=$(curl -s -X PATCH "$API_URL/$PAYMENT_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"status":"PENDING"}')
echo "Result: $RESULT1"
echo ""

# Test 2: Обновление с failure_message
echo "🔄 TEST 2: Update with failure message"
echo "Sending: {\"status\":\"FAILED\",\"failure_message\":\"Test error\"}"
RESULT2=$(curl -s -X PATCH "$API_URL/$PAYMENT_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"status":"FAILED","failure_message":"Test error from bash script"}')
echo "Result: $RESULT2"
echo ""

# Test 3: Полное обновление успешного платежа
echo "🔄 TEST 3: Full success payment update"
CURRENT_TIME=$(date "+%Y-%m-%d %H:%M:%S")
echo "Sending: Success payment with all fields"
RESULT3=$(curl -s -X PATCH "$API_URL/$PAYMENT_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"status\":\"PAID\",\"gateway_payment_id\":\"test_$(date +%s)\",\"card_last4\":\"4444\",\"payment_method\":\"card\",\"paid_at\":\"$CURRENT_TIME\"}")
echo "Result: $RESULT3"
echo ""

echo "✅ Тестирование завершено!"
echo ""
echo "📊 Если все 3 теста вернули success:true, то исправления работают корректно"
echo "   и статусы платежей теперь обновляются без ошибок Prisma validation"
