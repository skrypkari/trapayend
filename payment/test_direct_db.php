<?php
// Простой тест обновления платежа напрямую в базе данных

echo "🔧 Direct Database Payment Update Test\n\n";

$paymentId = 'cme8si8w5001q33l3k1utxw6s';

try {
    // НАСТРОЙТЕ ПОДКЛЮЧЕНИЕ К ВАШЕЙ БД:
    $host = 'localhost';
    $dbname = 'your_database_name'; // Замените на реальное название БД
    $username = 'your_db_username'; // Замените на реального пользователя
    $password = 'your_db_password'; // Замените на реальный пароль
    
    echo "🔌 Connecting to database...\n";
    $pdo = new PDO("pgsql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✅ Database connected\n\n";
    
    // Проверяем текущий статус платежа
    echo "📋 Current payment status:\n";
    $stmt = $pdo->prepare("SELECT id, status, gatewayResponse, failureMessage FROM \"Payment\" WHERE id = ?");
    $stmt->execute([$paymentId]);
    $payment = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$payment) {
        throw new Exception("Payment $paymentId not found");
    }
    
    print_r($payment);
    echo "\n";
    
    // Обновляем статус платежа
    echo "🔄 Updating payment status to FAILED...\n";
    $updateStmt = $pdo->prepare("
        UPDATE \"Payment\" 
        SET status = ?, 
            gatewayResponse = ?, 
            failureMessage = ?,
            \"updatedAt\" = NOW()
        WHERE id = ?
    ");
    
    $gatewayResponse = json_encode([
        'error' => 'Test direct DB update',
        'step' => 'direct_db_test',
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    
    $updateStmt->execute([
        'FAILED',
        $gatewayResponse,
        'Direct database test update',
        $paymentId
    ]);
    
    echo "✅ Payment updated successfully\n\n";
    
    // Проверяем результат
    echo "📋 Updated payment status:\n";
    $checkStmt = $pdo->prepare("SELECT id, status, gatewayResponse, failureMessage, \"updatedAt\" FROM \"Payment\" WHERE id = ?");
    $checkStmt->execute([$paymentId]);
    $updatedPayment = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    print_r($updatedPayment);
    
    echo "\n🎉 Direct database update successful!\n";
    echo "💡 This confirms the database structure is correct.\n";
    echo "💡 The 500 error is likely in the API code, not the database.\n";
    
} catch (PDOException $e) {
    echo "❌ Database Error: " . $e->getMessage() . "\n";
    echo "\n💡 Please check your database connection settings in this script.\n";
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n" . str_repeat("=", 50) . "\n";
echo "📝 Instructions for server deployment:\n";
echo "1. Upload this script to your server\n";
echo "2. Update database connection settings\n";
echo "3. Run: php test_direct_db.php\n";
echo "4. This will help identify if the issue is in API or database\n";
?>
