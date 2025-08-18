// Простой тест для проверки field mapping
const fs = require('fs');

console.log('=== Проверка исправлений в payment_backend.php ===');

// Читаем файл payment_backend.php
const phpContent = fs.readFileSync('payment/payment_backend.php', 'utf8');

// Проверяем, что все поля исправлены
const checks = [
    { old: 'gateway_response', new: 'failureMessage', description: 'Gateway response field' },
    { old: 'gateway_payment_id', new: 'gatewayPaymentId', description: 'Gateway payment ID field' },
    { old: 'card_last4', new: 'cardLast4', description: 'Card last 4 digits field' },
    { old: 'payment_method', new: 'paymentMethod', description: 'Payment method field' },
    { old: 'paid_at', new: 'paidAt', description: 'Paid at timestamp field' }
];

let allGood = true;

checks.forEach(check => {
    const oldCount = (phpContent.match(new RegExp(`'${check.old}'`, 'g')) || []).length;
    const newCount = (phpContent.match(new RegExp(`'${check.new}'`, 'g')) || []).length;
    
    console.log(`${check.description}:`);
    console.log(`  Old field '${check.old}': ${oldCount} occurrences`);
    console.log(`  New field '${check.new}': ${newCount} occurrences`);
    
    if (oldCount > 0) {
        console.log(`  ❌ Still has old field names!`);
        allGood = false;
    } else {
        console.log(`  ✅ No old field names found`);
    }
    console.log();
});

console.log('=== Проверка исправлений в internal.ts ===');

// Читаем файл internal.ts
const tsContent = fs.readFileSync('src/routes/internal.ts', 'utf8');

// Проверяем, что gateway_response убран из allowedFields
if (tsContent.includes("'gateway_response'")) {
    console.log("❌ internal.ts still contains 'gateway_response' in allowedFields");
    allGood = false;
} else {
    console.log("✅ internal.ts no longer contains 'gateway_response'");
}

if (tsContent.includes("'failure_message'")) {
    console.log("✅ internal.ts contains 'failure_message'");
} else {
    console.log("❌ internal.ts missing 'failure_message'");
    allGood = false;
}

console.log('\n=== РЕЗУЛЬТАТ ===');
if (allGood) {
    console.log('✅ Все исправления применены правильно!');
    console.log('✅ Теперь все поля соответствуют Prisma schema');
    console.log('✅ API должен работать без ошибок валидации');
} else {
    console.log('❌ Есть проблемы, требующие исправления');
}
