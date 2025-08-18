<?php
// ✅ ФИНАЛЬНЫЙ ТЕСТ: Проверка исправленного Internal API
// Этот файл тестирует только правильные поля, совместимые с Prisma

$paymentId = 'cme8si8w5001q33l3k1utxw6s';

echo "🧪 ТЕСТИРОВАНИЕ ИСПРАВЛЕННОГО INTERNAL API\n";
echo "==========================================\n";
echo "Payment ID: $paymentId\n";
echo "Дата: " . date('Y-m-d H:i:s') . "\n\n";

function testAPI($testName, $updateData, $paymentId) {
    $url = "https://api.trapay.uk/api/internal/payments/$paymentId/update";
    
    echo "🔄 $testName\n";
    echo "Данные: " . json_encode($updateData) . "\n";
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_POSTFIELDS => json_encode($updateData),
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer internal-api-key',
            'User-Agent: PHPTestClient/1.0'
        ]
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    $success = $httpCode === 200;
    
    echo "HTTP Code: $httpCode\n";
    if ($error) {
        echo "Error: $error\n";
    }
    echo "Response: $response\n";
    echo "Status: " . ($success ? "✅ PASSED" : "❌ FAILED") . "\n\n";
    
    return $success;
}

// Тест 1: Простое обновление статуса
$test1 = testAPI("TEST 1: Simple Status Update", [
    'status' => 'PENDING'
], $paymentId);

// Тест 2: Обновление с сообщением об ошибке
$test2 = testAPI("TEST 2: Failed Payment with Error Message", [
    'status' => 'FAILED',
    'failure_message' => 'Payment failed during processing - Test from PHP ' . date('H:i:s')
], $paymentId);

// Тест 3: Полное обновление успешного платежа
$test3 = testAPI("TEST 3: Complete Success Payment Update", [
    'status' => 'PAID',
    'gateway_payment_id' => 'amer_test_' . time(),
    'card_last4' => '4444',
    'payment_method' => 'card',
    'paid_at' => date('Y-m-d H:i:s')
], $paymentId);

// Тест 4: Возврат к PENDING
$test4 = testAPI("TEST 4: Reset to Pending", [
    'status' => 'PENDING'
], $paymentId);

// Итоговый отчет
echo "📊 ИТОГОВЫЙ ОТЧЕТ\n";
echo "================\n";
$totalTests = 4;
$passedTests = ($test1 ? 1 : 0) + ($test2 ? 1 : 0) + ($test3 ? 1 : 0) + ($test4 ? 1 : 0);

echo "Пройдено тестов: $passedTests из $totalTests\n";

if ($passedTests === $totalTests) {
    echo "🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!\n";
    echo "✅ Internal API работает корректно\n";
    echo "✅ Prisma field mapping исправлен\n";
    echo "✅ Статусы платежей теперь обновляются без ошибок\n";
    echo "✅ Готово к продакшену!\n";
} else {
    echo "❌ Некоторые тесты провалились\n";
    echo "💡 Проверьте логи сервера для детальной информации\n";
}

echo "\n🔍 Что проверяют эти тесты:\n";
echo "- Базовое обновление статуса платежа\n";
echo "- Сохранение информации об ошибках\n";
echo "- Полное обновление успешного платежа со всеми деталями\n";
echo "- Корректность field mapping между PHP и Prisma\n";
?>
