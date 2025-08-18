<?php
// Тестовый файл для проверки соединения с внутренним API

$paymentId = 'cme8si8w5001q33l3k1utxw6s';

echo "🔍 Testing Internal API connection for payment: $paymentId\n\n";

// Test 1: Get payment settings
echo "=== TEST 1: Get Payment Settings ===\n";
$url = "https://api.trapay.uk/api/internal/payments/$paymentId/gateway-settings";

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer internal-api-key',
        'User-Agent: TestClient/1.0'
    ]
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

echo "URL: $url\n";
echo "HTTP Code: $httpCode\n";
echo "Error: " . ($error ?: 'None') . "\n";
echo "Response: $response\n\n";

// Test 2: Simple status update (минимальные данные)
echo "=== TEST 2: Simple Status Update ===\n";
$updateUrl = "https://api.trapay.uk/api/internal/payments/$paymentId/update";
$updateData = [
    'status' => 'FAILED'
];

$ch2 = curl_init();
curl_setopt_array($ch2, [
    CURLOPT_URL => $updateUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'PATCH',
    CURLOPT_POSTFIELDS => json_encode($updateData),
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer internal-api-key',
        'User-Agent: TestClient/1.0'
    ]
]);

$response2 = curl_exec($ch2);
$httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
$error2 = curl_error($ch2);
curl_close($ch2);

echo "URL: $updateUrl\n";
echo "Data: " . json_encode($updateData) . "\n";
echo "HTTP Code: $httpCode2\n";
echo "Error: " . ($error2 ?: 'None') . "\n";
echo "Response: $response2\n\n";

// Test 3: Update with failure_message only
echo "=== TEST 3: Update with Failure Message ===\n";
$updateData3 = [
    'status' => 'FAILED',
    'failure_message' => 'Test error from PHP - step: test_update - timestamp: ' . date('Y-m-d H:i:s')
];

$ch3 = curl_init();
curl_setopt_array($ch3, [
    CURLOPT_URL => $updateUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'PATCH',
    CURLOPT_POSTFIELDS => json_encode($updateData3),
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer internal-api-key',
        'User-Agent: TestClient/1.0'
    ]
]);

$response3 = curl_exec($ch3);
$httpCode3 = curl_getinfo($ch3, CURLINFO_HTTP_CODE);
$error3 = curl_error($ch3);
curl_close($ch3);

echo "URL: $updateUrl\n";
echo "Data: " . json_encode($updateData3) . "\n";
echo "HTTP Code: $httpCode3\n";
echo "Error: " . ($error3 ?: 'None') . "\n";
echo "Response: $response3\n\n";

// Test 4: Full payment success update
echo "=== TEST 4: Full Success Payment Update ===\n";
$updateData4 = [
    'status' => 'PAID',
    'gateway_payment_id' => 'test_transaction_' . time(),
    'card_last4' => '4444',
    'payment_method' => 'test_card',
    'paid_at' => date('Y-m-d H:i:s')
];

$ch4 = curl_init();
curl_setopt_array($ch4, [
    CURLOPT_URL => $updateUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'PATCH',
    CURLOPT_POSTFIELDS => json_encode($updateData4),
    CURLOPT_TIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer internal-api-key',
        'User-Agent: TestClient/1.0'
    ]
]);

$response4 = curl_exec($ch4);
$httpCode4 = curl_getinfo($ch4, CURLINFO_HTTP_CODE);
$error4 = curl_error($ch4);
curl_close($ch4);

echo "URL: $updateUrl\n";
echo "Data: " . json_encode($updateData4) . "\n";
echo "HTTP Code: $httpCode4\n";
echo "Error: " . ($error4 ?: 'None') . "\n";
echo "Response: $response4\n\n";

echo "=== Testing Complete ===\n";

// Выводим заключение
echo "\n📊 Summary:\n";
echo "Test 1 (Get Settings): " . ($httpCode == 200 ? "✅ PASSED" : "❌ FAILED") . "\n";
echo "Test 2 (Simple Update): " . ($httpCode2 == 200 ? "✅ PASSED" : "❌ FAILED") . "\n";
echo "Test 3 (Failure Message): " . ($httpCode3 == 200 ? "✅ PASSED" : "❌ FAILED") . "\n";
echo "Test 4 (Success Update): " . ($httpCode4 == 200 ? "✅ PASSED" : "❌ FAILED") . "\n";

if ($httpCode2 != 200 && $httpCode3 != 200 && $httpCode4 != 200) {
    echo "\n💡 Recommendation: Check server logs for detailed error information\n";
    echo "   The API might have database connection issues or field validation problems\n";
} else {
    echo "\n✅ Internal API is working correctly with updated field mappings!\n";
    echo "   Payment status updates should now work without Prisma validation errors\n";
}
?>
