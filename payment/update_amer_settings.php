<?php
// Скрипт для обновления настроек Amer шлюза в базе данных

echo "🔧 Updating Amer gateway settings in database...\n\n";

try {
    // Подключение к базе данных (настройте параметры подключения)
    $host = 'localhost'; // Или IP вашего сервера БД
    $dbname = 'your_database_name'; // Замените на название БД
    $username = 'your_db_username'; // Замените на пользователя БД
    $password = 'your_db_password'; // Замените на пароль БД
    
    $pdo = new PDO("pgsql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Получаем текущие настройки шлюза для шопа nike
    $stmt = $pdo->prepare("SELECT id, gatewaySettings FROM Shop WHERE username = ?");
    $stmt->execute(['nike']);
    $shop = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$shop) {
        throw new Exception("Shop 'nike' not found");
    }
    
    echo "✅ Found shop: {$shop['id']}\n";
    
    // Декодируем текущие настройки
    $currentSettings = json_decode($shop['gatewaySettings'], true);
    if (!$currentSettings) {
        $currentSettings = [];
    }
    
    // Обновляем настройки Amer шлюза
    $currentSettings['amer'] = [
        'commission' => 2.5,
        'minAmount' => 0,
        'maxAmount' => 100000,
        'payoutDelay' => 0,
        'customer' => '8MKTMRR4', // Worldpay Merchant ID (уникальный идентификатор мерчанта)
        'co' => 'al',               // Country Code (код страны мерчанта) 
        'product' => '100',         // Product Category ID (код категории товара в Worldpay)
        'country' => 'PL'           // Default billing country (страна плательщика по умолчанию)
    ];
    
    // Сохраняем обновленные настройки
    $updatedSettingsJson = json_encode($currentSettings);
    
    $updateStmt = $pdo->prepare("UPDATE Shop SET gatewaySettings = ? WHERE id = ?");
    $updateStmt->execute([$updatedSettingsJson, $shop['id']]);
    
    echo "✅ Updated Amer gateway settings:\n";
    echo "   customer: 8MKTMRR4 (исправлена опечатка 'costumer')\n";
    echo "   co: al\n";
    echo "   product: 100\n";
    echo "   country: PL\n\n";
    
    // Проверяем обновление
    $checkStmt = $pdo->prepare("SELECT gatewaySettings FROM Shop WHERE id = ?");
    $checkStmt->execute([$shop['id']]);
    $updatedShop = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    $updatedSettings = json_decode($updatedShop['gatewaySettings'], true);
    
    echo "📋 Current Amer settings:\n";
    print_r($updatedSettings['amer']);
    
    echo "\n🎉 Gateway settings updated successfully!\n";
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "\n💡 Please manually update the gatewaySettings in your database:\n";
    echo "   Table: Shop\n";
    echo "   Where: username = 'nike'\n";
    echo "   Update gatewaySettings JSON to include:\n";
    echo "   \"amer\": {\n";
    echo "     \"commission\": 2.5,\n";
    echo "     \"minAmount\": 0,\n";
    echo "     \"maxAmount\": 100000,\n";
    echo "     \"payoutDelay\": 0,\n";
    echo "     \"customer\": \"8MKTMRR4\",\n";
    echo "     \"co\": \"al\",\n";
    echo "     \"product\": \"100\",\n";
    echo "     \"country\": \"PL\"\n";
    echo "   }\n";
}
?>
