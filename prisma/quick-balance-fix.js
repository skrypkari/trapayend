/**
 * Быстрый скрипт для корректировки балансов
 * Упрощенная версия без детального логирования
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function quickBalanceFix() {
  console.log('🚀 Quick balance correction starting...');
  
  const shops = await prisma.shop.findMany({
    include: {
      payments: {
        where: {
          status: 'PAID',
          gateway: { not: 'test_gateway' },
        },
      },
      payouts: {
        where: {
          status: 'COMPLETED',
        },
      },
    },
  });

  console.log(`Processing ${shops.length} shops...`);

  for (const shop of shops) {
    let gatewaySettings = {};
    try {
      if (shop.gatewaySettings) {
        gatewaySettings = JSON.parse(shop.gatewaySettings);
      }
    } catch (e) {
      // Ignore parsing errors
    }

    // Calculate merchant earnings from payments
    let totalEarned = 0;
    for (const payment of shop.payments) {
      const amountUSDT = payment.amountUSDT || (payment.amount * 1.0); // Fallback rate
      
      // Find commission for this gateway
      let commission = 10;
      for (const [key, value] of Object.entries(gatewaySettings)) {
        if (key.toLowerCase() === payment.gateway.toLowerCase()) {
          commission = value.commission || 10;
          break;
        }
      }
      
      const merchantAmount = amountUSDT * (1 - commission / 100);
      totalEarned += merchantAmount;
    }

    // Calculate total payouts
    const totalPaidOut = shop.payouts.reduce((sum, payout) => sum + payout.amount, 0);
    
    // Final balance
    const correctBalance = Math.max(0, totalEarned - totalPaidOut);

    // Update if different
    if (Math.abs(correctBalance - shop.balance) > 0.01) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: {
          balance: correctBalance,
          totalPaidOut: totalPaidOut,
        },
      });
      console.log(`✅ ${shop.username}: ${shop.balance.toFixed(2)} -> ${correctBalance.toFixed(2)} USDT`);
    }
  }

  await prisma.$disconnect();
  console.log('✅ Quick correction completed!');
}

if (require.main === module) {
  quickBalanceFix().catch(console.error);
}

module.exports = { quickBalanceFix };
