<?php
// Скрипт для исправления опечатки 'costumer' → 'customer' в настройках Amer

echo "🔧 Fixing 'costumer' → 'customer' typo in Amer gateway settings...\n\n";

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
    
    echo "📋 Current Amer settings:\n";
    if (isset($currentSettings['Amer'])) {
        print_r($currentSettings['Amer']);
    } else {
        echo "   No Amer settings found\n";
    }
    echo "\n";
    
    // Исправляем опечатку и добавляем недостающие поля
    if (!isset($currentSettings['Amer'])) {
        $currentSettings['Amer'] = [];
    }
    
    // Сохраняем значение из 'costumer' если оно есть
    $customerValue = '8MKTMRR4'; // Значение по умолчанию
    if (isset($currentSettings['Amer']['costumer'])) {
        $customerValue = $currentSettings['Amer']['costumer'];
        unset($currentSettings['Amer']['costumer']); // Удаляем неправильное поле
        echo "🔄 Migrating 'costumer' value: $customerValue\n";
    }
    
    // Обновляем настройки Amer шлюза с правильными полями
    $currentSettings['Amer'] = array_merge($currentSettings['Amer'], [
        'commission' => $currentSettings['Amer']['commission'] ?? 2.5,
        'minAmount' => $currentSettings['Amer']['minAmount'] ?? 0,
        'maxAmount' => $currentSettings['Amer']['maxAmount'] ?? 100000,
        'payoutDelay' => $currentSettings['Amer']['payoutDelay'] ?? 0,
        'customer' => $customerValue,      // ✅ Правильное название
        'co' => 'al',                      // Country code
        'product' => '100',                // Product ID
        'country' => 'PL'                  // Default billing country
    ]);
    
    // Сохраняем обновленные настройки
    $updatedSettingsJson = json_encode($currentSettings);
    
    $updateStmt = $pdo->prepare("UPDATE Shop SET gatewaySettings = ? WHERE id = ?");
    $updateStmt->execute([$updatedSettingsJson, $shop['id']]);
    
    echo "✅ Fixed typo and updated Amer gateway settings:\n";
    echo "   customer: $customerValue (исправлено с 'costumer')\n";
    echo "   co: al\n";
    echo "   product: 100\n";
    echo "   country: PL\n\n";
    
    // Проверяем обновление
    $checkStmt = $pdo->prepare("SELECT gatewaySettings FROM Shop WHERE id = ?");
    $checkStmt->execute([$shop['id']]);
    $updatedShop = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    $updatedSettings = json_decode($updatedShop['gatewaySettings'], true);
    
    echo "📋 Updated Amer settings:\n";
    print_r($updatedSettings['Amer']);
    
    // Проверяем что 'costumer' больше нет
    if (isset($updatedSettings['Amer']['costumer'])) {
        echo "❌ Warning: 'costumer' field still exists!\n";
    } else {
        echo "✅ Confirmed: 'costumer' field removed\n";
    }
    
    if (isset($updatedSettings['Amer']['customer'])) {
        echo "✅ Confirmed: 'customer' field exists with value: " . $updatedSettings['Amer']['customer'] . "\n";
    }
    
    echo "\n🎉 Typo fixed and gateway settings updated successfully!\n";
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "\n💡 Please manually fix the typo in your database:\n";
    echo "   Table: Shop\n";
    echo "   Where: username = 'nike'\n";
    echo "   Change: 'costumer' → 'customer' in gatewaySettings JSON\n";
    echo "   And add missing fields: co, product, country\n";
}

echo "\n" . str_repeat("=", 50) . "\n";
echo "📝 Validation Error Solution:\n";
echo "The API validation failed because:\n";
echo "- Field name was 'costumer' instead of 'customer'\n";
echo "- This script fixes the typo and adds required fields\n";
echo "- After running this, the API validation should pass\n";
?>
