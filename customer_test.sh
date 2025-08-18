#!/bin/bash

# Специальный тест для проверки customer параметра
echo "🎯 Customer Parameter Test"
echo "========================="

API_BASE="https://api.trapay.uk"
PUBLIC_KEY="pk_test_demo"  # Замените на реальный ключ

# Создаем платеж с customer параметром
echo "1. Creating payment with customer parameter..."
RESPONSE=$(curl -s -X POST "${API_BASE}/api/public/payments" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "'${PUBLIC_KEY}'",
    "gateway": "1111",
    "amount": 100,
    "currency": "USD",
    "customer": "8MKTMRR4",
    "customer_email": "customer@test.com",
    "customer_name": "Test Customer"
  }')

echo "API Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Извлекаем payment ID
PAYMENT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$PAYMENT_ID" ]; then
    echo "✅ Payment created: $PAYMENT_ID"
    echo ""
    
    # Проверяем разные URL варианты
    echo "2. Testing payment URLs:"
    echo "========================"
    
    echo "🔗 Basic payment URL:"
    echo "https://app.trapay.uk/payment/$PAYMENT_ID"
    echo ""
    
    echo "🔗 Payment URL with customer parameter:"
    echo "https://app.trapay.uk/payment/$PAYMENT_ID?customer=8MKTMRR4"
    echo ""
    
    echo "🔗 Direct PHP form URL (api2.trapay.uk):"
    echo "https://api2.trapay.uk/payment.php?id=$PAYMENT_ID"
    echo ""
    
    echo "🔗 Direct PHP form URL with customer:"
    echo "https://api2.trapay.uk/payment.php?id=$PAYMENT_ID&customer=8MKTMRR4"
    echo ""
    
    # Проверяем статус платежа
    echo "3. Checking payment status:"
    echo "=========================="
    STATUS_RESPONSE=$(curl -s "${API_BASE}/api/public/payments/$PAYMENT_ID")
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    echo ""
    
    # Извлекаем customer из ответа для проверки
    CUSTOMER_FROM_API=$(echo $STATUS_RESPONSE | grep -o '"rapyd_customer":"[^"]*"' | cut -d'"' -f4)
    if [ "$CUSTOMER_FROM_API" = "8MKTMRR4" ]; then
        echo "✅ Customer parameter correctly saved: $CUSTOMER_FROM_API"
    else
        echo "⚠️  Customer parameter issue: expected '8MKTMRR4', got '$CUSTOMER_FROM_API'"
    fi
    echo ""
    
    echo "4. Manual testing instructions:"
    echo "=============================="
    echo "1. Open this URL in browser:"
    echo "   https://api2.trapay.uk/payment.php?id=$PAYMENT_ID&customer=8MKTMRR4"
    echo ""
    echo "2. Check if customer field is pre-filled with: 8MKTMRR4"
    echo ""
    echo "3. Fill test card details:"
    echo "   Card: 4111111111111111"
    echo "   Expiry: 12/25"
    echo "   CVV: 123"
    echo ""
    echo "4. Submit and check if customer data is passed correctly"
    echo ""
    echo "5. Monitor status updates:"
    while true; do
        read -p "Press Enter to check current status (or Ctrl+C to exit): "
        CURRENT_STATUS=$(curl -s "${API_BASE}/api/public/payments/$PAYMENT_ID")
        STATUS=$(echo $CURRENT_STATUS | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        echo "Current status: $STATUS"
        
        if [ "$STATUS" = "PAID" ] || [ "$STATUS" = "FAILED" ]; then
            echo "Payment completed with status: $STATUS"
            echo "Final response:"
            echo "$CURRENT_STATUS" | jq '.' 2>/dev/null || echo "$CURRENT_STATUS"
            break
        fi
    done
    
else
    echo "❌ Failed to create payment"
    echo "Response: $RESPONSE"
fi

echo ""
echo "🏁 Test completed!"
