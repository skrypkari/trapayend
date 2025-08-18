<?php
// Детальное тестирование Internal API с полной диагностикой

echo "🔧 Detailed Internal API Diagnostics\n";
echo str_repeat("=", 60) . "\n\n";

$paymentId = 'cme8si8w5001q33l3k1utxw6s';
$baseUrl = 'https://api.trapay.uk';
$apiKey = 'internal-api-key'; // Убедитесь, что это правильный ключ

echo "💡 Testing payment ID: $paymentId\n";
echo "💡 Base URL: $baseUrl\n";
echo "💡 API Key: " . substr($apiKey, 0, 10) . "...\n\n";

// Функция для детального тестирования
function detailedTest($url, $method, $data, $apiKey, $testName) {
    echo "🧪 Test: $testName\n";
    echo "🌐 URL: $url\n";
    echo "🔧 Method: $method\n";
    
    if ($data) {
        echo "📤 Request Data:\n" . json_encode($data, JSON_PRETTY_PRINT) . "\n";
    }
    
    $ch = curl_init();
    $options = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => 'TrapayTestClient/1.0',
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $apiKey,
            'X-Requested-With: XMLHttpRequest'
        ]
    ];
    
    if ($method === 'POST') {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = json_encode($data);
    } elseif ($method === 'PATCH') {
        $options[CURLOPT_CUSTOMREQUEST] = 'PATCH';
        $options[CURLOPT_POSTFIELDS] = json_encode($data);
    } elseif ($method === 'PUT') {
        $options[CURLOPT_CUSTOMREQUEST] = 'PUT';
        $options[CURLOPT_POSTFIELDS] = json_encode($data);
    }
    
    curl_setopt_array($ch, $options);
    
    $startTime = microtime(true);
    $fullResponse = curl_exec($ch);
    $endTime = microtime(true);
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $totalTime = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
    $connectTime = curl_getinfo($ch, CURLINFO_CONNECT_TIME);
    $error = curl_error($ch);
    $errorNum = curl_errno($ch);
    curl_close($ch);
    
    $headers = substr($fullResponse, 0, $headerSize);
    $body = substr($fullResponse, $headerSize);
    
    // Анализ результата
    echo "⏱️  Response Time: " . round($totalTime * 1000, 2) . "ms\n";
    echo "🔗 Connect Time: " . round($connectTime * 1000, 2) . "ms\n";
    echo "📥 HTTP Code: $httpCode\n";
    
    if ($error) {
        echo "❌ cURL Error ($errorNum): $error\n";
    }
    
    echo "📋 Response Headers:\n";
    echo trim($headers) . "\n";
    
    echo "📄 Response Body:\n";
    echo $body . "\n";
    
    // Анализ статуса
    if ($httpCode >= 200 && $httpCode < 300) {
        echo "✅ Status: SUCCESS\n";
    } elseif ($httpCode >= 400 && $httpCode < 500) {
        echo "⚠️  Status: CLIENT ERROR\n";
    } elseif ($httpCode >= 500) {
        echo "❌ Status: SERVER ERROR\n";
    } else {
        echo "❓ Status: UNKNOWN\n";
    }
    
    echo str_repeat("-", 60) . "\n\n";
    
    return [
        'code' => $httpCode,
        'response' => $body,
        'headers' => $headers,
        'error' => $error,
        'time' => $totalTime
    ];
}

// Тест 1: Проверяем здоровье API
echo "🏥 API Health Check\n";
$healthResult = detailedTest("$baseUrl/api/health", 'GET', null, $apiKey, 'API Health Check');

// Тест 2: Проверяем аутентификацию
echo "🔐 Authentication Test\n";
$authResult = detailedTest("$baseUrl/api/internal/test", 'GET', null, $apiKey, 'Authentication Test');

// Тест 3: Получаем информацию о платеже
echo "📋 Get Payment Info\n";
$getPaymentResult = detailedTest("$baseUrl/api/internal/payments/$paymentId", 'GET', null, $apiKey, 'Get Payment Information');

// Тест 4: Получаем настройки гейтвея
echo "⚙️  Get Gateway Settings\n";
$getSettingsResult = detailedTest("$baseUrl/api/internal/payments/$paymentId/gateway-settings", 'GET', null, $apiKey, 'Get Gateway Settings');

// Тест 5: Минимальное обновление статуса
echo "🔄 Minimal Status Update\n";
$minimalData = ['status' => 'FAILED'];
$minimalResult = detailedTest("$baseUrl/api/internal/payments/$paymentId/update", 'PATCH', $minimalData, $apiKey, 'Minimal Status Update');

// Тест 6: Обновление с failureMessage
echo "💬 Update with Failure Message\n";
$messageData = [
    'status' => 'FAILED',
    'failureMessage' => 'Test failure message'
];
$messageResult = detailedTest("$baseUrl/api/internal/payments/$paymentId/update", 'PATCH', $messageData, $apiKey, 'Update with Failure Message');

// Тест 7: Обновление с gatewayResponse как строка
echo "📝 Update with String Gateway Response\n";
$stringData = [
    'status' => 'FAILED',
    'failureMessage' => 'String gateway response test',
    'gatewayResponse' => 'Simple string error message'
];
$stringResult = detailedTest("$baseUrl/api/internal/payments/$paymentId/update", 'PATCH', $stringData, $apiKey, 'Update with String Gateway Response');

// Тест 8: Полное обновление с JSON
echo "🌟 Complete JSON Update\n";
$completeData = [
    'status' => 'FAILED',
    'failureMessage' => 'Complete test update',
    'gatewayResponse' => json_encode([
        'error' => 'Final payment failed: null',
        'step' => 'complete_test',
        'timestamp' => date('Y-m-d H:i:s'),
        'details' => [
            'test_type' => 'complete_json_update',
            'payment_id' => $paymentId
        ]
    ])
];
$completeResult = detailedTest("$baseUrl/api/internal/payments/$paymentId/update", 'PATCH', $completeData, $apiKey, 'Complete JSON Update');

// Тест 9: Альтернативный метод POST
echo "🔄 Alternative POST Method\n";
$postData = [
    'paymentId' => $paymentId,
    'status' => 'FAILED',
    'failureMessage' => 'POST method test'
];
$postResult = detailedTest("$baseUrl/api/internal/payment/update", 'POST', $postData, $apiKey, 'Alternative POST Method');

// Тест 10: Альтернативный endpoint
echo "🎯 Alternative Endpoint\n";
$altData = [
    'status' => 'FAILED',
    'failure_message' => 'Alternative endpoint test'
];
$altResult = detailedTest("$baseUrl/api/internal/payment/$paymentId/status", 'PUT', $altData, $apiKey, 'Alternative Endpoint Test');

// Сводка результатов
echo "📊 COMPREHENSIVE TEST RESULTS\n";
echo str_repeat("=", 60) . "\n";

$tests = [
    'Health Check' => $healthResult,
    'Authentication' => $authResult,
    'Get Payment' => $getPaymentResult,
    'Get Settings' => $getSettingsResult,
    'Minimal Update' => $minimalResult,
    'Message Update' => $messageResult,
    'String Update' => $stringResult,
    'Complete Update' => $completeResult,
    'POST Method' => $postResult,
    'Alternative Endpoint' => $altResult
];

$successCount = 0;
foreach ($tests as $testName => $result) {
    $status = ($result['code'] >= 200 && $result['code'] < 300) ? '✅ PASS' : '❌ FAIL';
    if ($result['code'] >= 200 && $result['code'] < 300) $successCount++;
    
    echo sprintf("%-20s: %s (HTTP %d) - %.2fms\n", 
        $testName, $status, $result['code'], $result['time'] * 1000);
}

echo "\n🎯 Summary: $successCount/" . count($tests) . " tests passed\n";

// Рекомендации
echo "\n💡 RECOMMENDATIONS:\n";
if ($successCount == 0) {
    echo "❌ All tests failed - check basic connectivity and API key\n";
} elseif ($successCount < 4) {
    echo "⚠️  Most tests failed - check API endpoints and authentication\n";
} elseif ($minimalResult['code'] == 500) {
    echo "❌ Payment update failing with 500 error - check server logs\n";
    echo "   Likely database or validation issue in the API code\n";
} elseif ($successCount < count($tests)) {
    echo "⚠️  Some tests failed - check specific endpoints\n";
} else {
    echo "✅ All tests passed - API is working correctly!\n";
}

echo "\n📋 NEXT STEPS:\n";
echo "1. Check server error logs: /var/log/nginx/error.log\n";
echo "2. Check application logs for detailed error messages\n";
echo "3. Verify database connection and schema\n";
echo "4. Test with your actual API key\n";
echo "5. Run the direct database test (test_direct_db.php)\n";

echo "\n" . str_repeat("=", 60) . "\n";
?>
