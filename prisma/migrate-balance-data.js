#!/usr/bin/env node

/**
 * Скрипт миграции для заполнения полей balance, totalPaidOut и amountUSDT
 * на основе исторических данных платежей и выплат.
 * 
 * Этот скрипт должен быть запущен ОДИН РАЗ после применения новой схемы базы данных.
 * 
 * Использование:
 * node scripts/migrate-balance-data.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Импортируем currencyService для конвертации
async function convertToUSDT(amount, currency) {
  // Простая реализация конвертации для миграции
  // В реальности используйте ваш currencyService
  
  // Получаем курс из базы данных
  const rate = await prisma.currencyRate.findUnique({
    where: { currency: currency.toLowerCase() },
  });
  
  if (!rate) {
    console.warn(`No rate found for currency: ${currency}, using 1 as fallback`);
    return amount;
  }
  
  // Для большинства валют: amount / rate = USDT
  const usdtAmount = amount / rate.rate;
  
  // Применяем 3% наценку (как в currencyService)
  const usdtWithMarkup = usdtAmount * 1.03;
  
  return usdtWithMarkup;
}

async function migrateBalanceData() {
  console.log('🔄 Starting balance data migration...');
  
  try {
    // Получаем всех мерчантов
    const shops = await prisma.shop.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        balance: true,
        totalPaidOut: true,
      },
    });
    
    console.log(`📊 Found ${shops.length} shops to migrate`);
    
    let migratedShops = 0;
    let migratedPayments = 0;
    
    for (const shop of shops) {
      console.log(`\n🏪 Processing shop: ${shop.username} (${shop.name})`);
      
      // Пропускаем, если баланс уже заполнен (миграция уже выполнена)
      if (shop.balance !== 0 || shop.totalPaidOut !== 0) {
        console.log(`⚠️ Shop ${shop.username} already has balance data, skipping...`);
        continue;
      }
      
      await prisma.$transaction(async (tx) => {
        let shopBalance = 0;
        let shopTotalPaidOut = 0;
        
        // 1. Обрабатываем все PAID платежи
        const paidPayments = await tx.payment.findMany({
          where: {
            shopId: shop.id,
            status: 'PAID',
            gateway: { not: 'test_gateway' }, // Exclude test gateway from migration
            gateway: { not: 'test_gateway' }, // Исключаем тестовые платежи
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            amountUSDT: true,
            createdAt: true,
            paidAt: true,
          },
        });
        
        console.log(`   💰 Found ${paidPayments.length} PAID payments`);
        
        for (const payment of paidPayments) {
          try {
            let amountUSDT;
            
            // Если amountUSDT уже заполнен, используем его
            if (payment.amountUSDT) {
              amountUSDT = payment.amountUSDT;
              console.log(`   ✅ Payment ${payment.id}: using existing amountUSDT ${amountUSDT.toFixed(6)}`);
            } else {
              // Конвертируем в USDT
              amountUSDT = await convertToUSDT(payment.amount, payment.currency);
              
              // Обновляем платеж с amountUSDT
              await tx.payment.update({
                where: { id: payment.id },
                data: { amountUSDT },
              });
              
              console.log(`   💱 Payment ${payment.id}: converted ${payment.amount} ${payment.currency} -> ${amountUSDT.toFixed(6)} USDT`);
              migratedPayments++;
            }
            
            // Добавляем к балансу магазина
            shopBalance += amountUSDT;
            
          } catch (error) {
            console.error(`   ❌ Error processing payment ${payment.id}:`, error);
          }
        }
        
        // 2. Обрабатываем все выплаты
        const payouts = await tx.payout.findMany({
          where: {
            shopId: shop.id,
            status: 'COMPLETED',
          },
          select: {
            id: true,
            amount: true,
            createdAt: true,
          },
        });
        
        console.log(`   💸 Found ${payouts.length} completed payouts`);
        
        for (const payout of payouts) {
          shopTotalPaidOut += payout.amount;
          console.log(`   💸 Payout ${payout.id}: ${payout.amount.toFixed(6)} USDT`);
        }
        
        // 3. Обновляем баланс и общую сумму выплат магазина
        await tx.shop.update({
          where: { id: shop.id },
          data: {
            balance: shopBalance,
            totalPaidOut: shopTotalPaidOut,
          },
        });
        
        console.log(`   ✅ Shop ${shop.username} updated:`);
        console.log(`      Balance: ${shopBalance.toFixed(6)} USDT`);
        console.log(`      Total paid out: ${shopTotalPaidOut.toFixed(6)} USDT`);
        
        migratedShops++;
      });
    }
    
    console.log(`\n✅ Migration completed successfully!`);
    console.log(`📊 Summary:`);
    console.log(`   🏪 Shops migrated: ${migratedShops}/${shops.length}`);
    console.log(`   💰 Payments updated with amountUSDT: ${migratedPayments}`);
    
    // Показываем итоговую статистику
    const finalStats = await prisma.shop.aggregate({
      _sum: {
        balance: true,
        totalPaidOut: true,
      },
      _count: {
        id: true,
      },
      where: {
        status: 'ACTIVE',
      },
    });
    
    console.log(`\n📈 Final statistics:`);
    console.log(`   💰 Total balance across all shops: ${(finalStats._sum.balance || 0).toFixed(6)} USDT`);
    console.log(`   💸 Total paid out across all shops: ${(finalStats._sum.totalPaidOut || 0).toFixed(6)} USDT`);
    console.log(`   🏪 Active shops: ${finalStats._count.id}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем миграцию
if (require.main === module) {
  migrateBalanceData()
    .then(() => {
      console.log('🎉 Migration script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateBalanceData };