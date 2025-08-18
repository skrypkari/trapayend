#!/bin/bash

# Быстрый тест исправления gateway permission bug
echo "🔧 Testing Gateway Permission Fix"
echo "================================"

# Точно такой же запрос, который показал ошибку
echo "Testing the exact same request that failed..."

RESPONSE=$(curl -s -X POST "https://api.trapay.uk/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_8fed209892c6d4113e2be53090e1e60ea20ec61e9c60e8618ce6760439f79572",
    "gateway": "0010",
    "order_id": "test_20250814123000",
    "amount": 100,
    "currency": "USD",
    "customer_email": "test@example.com",
    "customer_name": "Test Customer"
  }')

echo "Response:"
echo "$RESPONSE"
echo ""

# Проверяем результат
if echo "$RESPONSE" | grep -q '"success":true\|"id":'; then
    echo "✅ SUCCESS: Payment created successfully!"
    
    # Извлекаем ID платежа
    PAYMENT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    if [ ! -z "$PAYMENT_ID" ]; then
        echo "Payment ID: $PAYMENT_ID"
        echo "🔗 Payment URL: https://app.trapay.uk/payment/$PAYMENT_ID"
        echo "🔗 Direct form: https://api2.trapay.uk/payment.php?id=$PAYMENT_ID"
    fi
    
elif echo "$RESPONSE" | grep -q "not enabled"; then
    echo "❌ STILL FAILING: Gateway permission issue persists"
    echo "Error details:"
    echo "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4
    
else
    echo "⚠️  UNEXPECTED: Different response"
fi

echo ""
echo "🧪 Additional tests..."

# Тест с gateway 1111 (MasterCard)
echo "Testing MasterCard gateway (1111)..."
MC_RESPONSE=$(curl -s -X POST "https://api.trapay.uk/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "pk_8fed209892c6d4113e2be53090e1e60ea20ec61e9c60e8618ce6760439f79572",
    "gateway": "1111",
    "amount": 50,
    "currency": "USD",
    "customer": "8MKTMRR4"
  }')

if echo "$MC_RESPONSE" | grep -q '"success":true\|"id":'; then
    echo "✅ MasterCard: SUCCESS"
    MC_ID=$(echo $MC_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "MasterCard Payment ID: $MC_ID"
else
    echo "❌ MasterCard: FAILED"
    echo "$MC_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4
fi

echo ""
echo "🎯 Test Summary:"
echo "- Rapyd (0010): $(echo "$RESPONSE" | grep -q '"success":true\|"id":' && echo "SUCCESS" || echo "FAILED")"
echo "- MasterCard (1111): $(echo "$MC_RESPONSE" | grep -q '"success":true\|"id":' && echo "SUCCESS" || echo "FAILED")"
echo ""
echo "🔄 If both tests pass, the gateway permission bug is fixed!"
