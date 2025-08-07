/**
 * Скрипт для анализа текущего состояния балансов
 * Показывает расхождения между текущими и правильными балансами
 * БЕЗ ИЗМЕНЕНИЯ ДАННЫХ - только анализ
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Функция для конвертации валют в USDT
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

async function analyzeBalances() {
  console.log('🔍 Analyzing current balance state (READ ONLY)...');
  
  try {
    const shops = await prisma.shop.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        username: true,
        balance: true,
        totalPaidOut: true,
        gatewaySettings: true,
      },
    });

    console.log(`📊 Analyzing ${shops.length} active shops\n`);

    let totalCurrentBalance = 0;
    let totalCorrectBalance = 0;
    let totalAdjustmentNeeded = 0;
    let shopsNeedingAdjustment = 0;

    for (const shop of shops) {
      // Получаем все PAID платежи
      const paidPayments = await prisma.payment.findMany({
        where: {
          shopId: shop.id,
          status: 'PAID',
          gateway: { not: 'test_gateway' },
        },
        select: {
          amount: true,
          currency: true,
          amountUSDT: true,
          gateway: true,
        },
      });

      // Получаем настройки комиссий
      let gatewaySettings = {};
      if (shop.gatewaySettings) {
        try {
          gatewaySettings = JSON.parse(shop.gatewaySettings);
        } catch (error) {
          // Ignore parsing errors
        }
      }

      // Рассчитываем правильный заработок
      let correctEarnings = 0;
      for (const payment of paidPayments) {
        const amountUSDT = payment.amountUSDT || convertToUSDT(payment.amount, payment.currency);
        
        // Определяем комиссию
        let commission = 10;
        for (const [key, value] of Object.entries(gatewaySettings)) {
          if (key.toLowerCase() === payment.gateway.toLowerCase()) {
            commission = value.commission || 10;
            break;
          }
        }
        
        const merchantAmount = amountUSDT * (1 - commission / 100);
        correctEarnings += merchantAmount;
      }

      // Получаем выплаты
      const payouts = await prisma.payout.findMany({
        where: {
          shopId: shop.id,
          status: 'COMPLETED',
        },
        select: {
          amount: true,
        },
      });

      const totalPayouts = payouts.reduce((sum, payout) => sum + payout.amount, 0);
      const correctBalance = Math.max(0, correctEarnings - totalPayouts);
      const adjustment = correctBalance - shop.balance;

      totalCurrentBalance += shop.balance;
      totalCorrectBalance += correctBalance;

      if (Math.abs(adjustment) > 0.01) {
        totalAdjustmentNeeded += Math.abs(adjustment);
        shopsNeedingAdjustment++;
        
        console.log(`⚠️ ${shop.username}:`);
        console.log(`   Current: ${shop.balance.toFixed(2)} USDT`);
        console.log(`   Correct: ${correctBalance.toFixed(2)} USDT`);
        console.log(`   Adjustment: ${adjustment > 0 ? '+' : ''}${adjustment.toFixed(2)} USDT`);
        console.log(`   Payments: ${paidPayments.length}, Payouts: ${payouts.length}`);
        console.log(`   Earned: ${correctEarnings.toFixed(2)} USDT, Paid out: ${totalPayouts.toFixed(2)} USDT\n`);
      }
    }

    console.log(`📊 SUMMARY:`);
    console.log(`   Total shops analyzed: ${shops.length}`);
    console.log(`   Shops needing adjustment: ${shopsNeedingAdjustment}`);
    console.log(`   Current total balance: ${totalCurrentBalance.toFixed(2)} USDT`);
    console.log(`   Correct total balance: ${totalCorrectBalance.toFixed(2)} USDT`);
    console.log(`   Total adjustment needed: ${(totalCorrectBalance - totalCurrentBalance).toFixed(2)} USDT`);
    console.log(`   Total absolute adjustments: ${totalAdjustmentNeeded.toFixed(2)} USDT`);

    if (shopsNeedingAdjustment === 0) {
      console.log(`✅ All balances are correct!`);
    } else {
      console.log(`⚠️ ${shopsNeedingAdjustment} shops need balance adjustment`);
      console.log(`🔧 Run migration script to fix: node prisma/migrate-balance-correction.js`);
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  analyzeBalances()
    .then(() => {
      console.log('\n✅ Analysis completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = { analyzeBalances };
