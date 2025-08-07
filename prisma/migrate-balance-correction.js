/**
 * Миграционный скрипт для корректировки балансов мерчантов
 * 
 * Этот скрипт:
 * 1. Пересчитывает баланс каждого мерчанта на основе PAID платежей с учетом комиссий
 * 2. Вычитает все выполненные выплаты
 * 3. Обновляет поля balance и totalPaidOut в таблице shops
 * 
 * ВАЖНО: Запускать только после исправления логики в adminService.ts!
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Функция для конвертации валют в USDT (упрощенная версия)
const CURRENCY_RATES = {
  'USD': 1.0,
  'EUR': 1.1,
  'GBP': 1.25,
  'RUB': 0.011,
  'USDT': 1.0,
  'BTC': 45000,
  'ETH': 2500,
  'LTC': 90,
  'DOGE': 0.08,
  'TRX': 0.08,
  'MATIC': 0.7,
  'USDC': 1.0,
};

function convertToUSDT(amount, currency) {
  const rate = CURRENCY_RATES[currency.toUpperCase()] || 1.0;
  return amount * rate;
}

async function migrateBalances() {
  console.log('🔄 Starting balance migration...');
  console.log('📊 This will recalculate all merchant balances based on PAID payments with commission deduction');
  
  try {
    // Получаем все магазины
    const shops = await prisma.shop.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        balance: true,
        totalPaidOut: true,
        gatewaySettings: true,
      },
    });

    console.log(`📋 Found ${shops.length} shops to process`);

    let totalProcessed = 0;
    let totalBalanceAdjustment = 0;

    for (const shop of shops) {
      console.log(`\n💰 Processing shop: ${shop.username} (${shop.name})`);
      console.log(`   Current balance: ${shop.balance.toFixed(6)} USDT`);
      console.log(`   Current total paid out: ${shop.totalPaidOut.toFixed(6)} USDT`);

      // Получаем все PAID платежи для этого магазина
      const paidPayments = await prisma.payment.findMany({
        where: {
          shopId: shop.id,
          status: 'PAID',
          gateway: { not: 'test_gateway' }, // Исключаем тестовые платежи
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          amountUSDT: true,
          gateway: true,
          createdAt: true,
        },
      });

      console.log(`   📊 Found ${paidPayments.length} PAID payments`);

      // Разбираем настройки комиссий
      let gatewaySettings = {};
      if (shop.gatewaySettings) {
        try {
          gatewaySettings = JSON.parse(shop.gatewaySettings);
        } catch (error) {
          console.error(`   ⚠️ Error parsing gateway settings: ${error.message}`);
        }
      }

      // Пересчитываем баланс на основе платежей с учетом комиссий
      let calculatedBalance = 0;
      const gatewayBreakdown = {};

      for (const payment of paidPayments) {
        // Конвертируем в USDT (используем сохраненную сумму если есть, иначе конвертируем)
        let amountUSDT = payment.amountUSDT;
        if (!amountUSDT) {
          amountUSDT = convertToUSDT(payment.amount, payment.currency);
        }

        // Определяем комиссию для шлюза
        let commission = 10; // По умолчанию 10%
        
        // Ищем настройки шлюза без учета регистра
        for (const [key, value] of Object.entries(gatewaySettings)) {
          if (key.toLowerCase() === payment.gateway.toLowerCase()) {
            commission = value.commission || 10;
            break;
          }
        }

        // Вычисляем сумму после комиссии (которая должна идти мерчанту)
        const merchantAmount = amountUSDT * (1 - commission / 100);
        calculatedBalance += merchantAmount;

        // Для статистики
        if (!gatewayBreakdown[payment.gateway]) {
          gatewayBreakdown[payment.gateway] = {
            count: 0,
            totalAmount: 0,
            totalMerchantAmount: 0,
            commission: commission,
          };
        }
        gatewayBreakdown[payment.gateway].count++;
        gatewayBreakdown[payment.gateway].totalAmount += amountUSDT;
        gatewayBreakdown[payment.gateway].totalMerchantAmount += merchantAmount;
      }

      // Получаем все выплаты для этого магазина
      const payouts = await prisma.payout.findMany({
        where: {
          shopId: shop.id,
          status: 'COMPLETED',
        },
        select: {
          amount: true,
          createdAt: true,
        },
      });

      const totalPayouts = payouts.reduce((sum, payout) => sum + payout.amount, 0);
      console.log(`   💸 Found ${payouts.length} completed payouts, total: ${totalPayouts.toFixed(6)} USDT`);

      // Итоговый баланс = заработано с платежей - выплачено
      const finalBalance = calculatedBalance - totalPayouts;

      console.log(`   📊 Gateway breakdown:`);
      for (const [gateway, stats] of Object.entries(gatewayBreakdown)) {
        console.log(`     ${gateway}: ${stats.count} payments, ${stats.totalAmount.toFixed(2)} USDT gross, ${stats.totalMerchantAmount.toFixed(2)} USDT net (${stats.commission}% commission)`);
      }

      console.log(`   🧮 Calculation summary:`);
      console.log(`     Earned from payments (after commission): ${calculatedBalance.toFixed(6)} USDT`);
      console.log(`     Total payouts: ${totalPayouts.toFixed(6)} USDT`);
      console.log(`     Final calculated balance: ${finalBalance.toFixed(6)} USDT`);

      const balanceAdjustment = finalBalance - shop.balance;
      totalBalanceAdjustment += Math.abs(balanceAdjustment);

      if (Math.abs(balanceAdjustment) > 0.01) { // Только если разница больше 1 цента
        console.log(`   🔄 Balance adjustment needed: ${balanceAdjustment > 0 ? '+' : ''}${balanceAdjustment.toFixed(6)} USDT`);

        // Обновляем баланс и totalPaidOut
        await prisma.shop.update({
          where: { id: shop.id },
          data: {
            balance: Math.max(0, finalBalance), // Не позволяем отрицательному балансу
            totalPaidOut: totalPayouts,
          },
        });

        console.log(`   ✅ Updated balance: ${shop.balance.toFixed(6)} -> ${Math.max(0, finalBalance).toFixed(6)} USDT`);
        console.log(`   ✅ Updated totalPaidOut: ${shop.totalPaidOut.toFixed(6)} -> ${totalPayouts.toFixed(6)} USDT`);
      } else {
        console.log(`   ✅ Balance is correct, no adjustment needed`);
      }

      totalProcessed++;
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Summary:`);
    console.log(`   Shops processed: ${totalProcessed}`);
    console.log(`   Total balance adjustments: ${totalBalanceAdjustment.toFixed(6)} USDT`);

    // Финальная проверка - показываем общую статистику
    const finalStats = await prisma.shop.aggregate({
      _sum: {
        balance: true,
        totalPaidOut: true,
      },
      where: {
        status: 'ACTIVE',
      },
    });

    console.log(`💰 Final system totals:`);
    console.log(`   Total merchant balances: ${(finalStats._sum.balance || 0).toFixed(2)} USDT`);
    console.log(`   Total paid out: ${(finalStats._sum.totalPaidOut || 0).toFixed(2)} USDT`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Проверяем, что скрипт запускается напрямую
if (require.main === module) {
  migrateBalances()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateBalances };
