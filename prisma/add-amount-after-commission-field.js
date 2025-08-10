/**
 * Миграционный скрипт для добавления поля amountAfterGatewayCommissionUSDT
 * 
 * Этот скрипт:
 * 1. Добавляет поле amount_after_gateway_commission_usdt в таблицу payments
 * 2. Заполняет существующие PAID платежи рассчитанной суммой с учетом комиссии
 * 3. Использует настройки шлюзов из gatewaySettings для расчета комиссии
 * 
 * ВАЖНО: Запускать только после обновления схемы Prisma!
 */

// Загружаем переменные окружения
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Функция для получения комиссии шлюза
function getGatewayCommission(gatewaySettings, gateway) {
  if (!gatewaySettings) return 10; // Дефолтная комиссия 10%
  
  try {
    const settings = JSON.parse(gatewaySettings);
    
    // Ищем настройки шлюза без учета регистра
    for (const [key, value] of Object.entries(settings)) {
      if (key.toLowerCase() === gateway.toLowerCase()) {
        return value.commission || 10;
      }
    }
  } catch (error) {
    console.error(`Error parsing gateway settings:`, error);
  }
  
  return 10; // Дефолтная комиссия 10%
}

async function migrateAmountAfterCommission() {
  console.log('🚀 Начинаем миграцию добавления поля amountAfterGatewayCommissionUSDT...\n');

  try {
    // 1. Добавляем поле в базу данных (если еще не добавлено)
    console.log('📋 Добавляем поле amount_after_gateway_commission_usdt...');
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE payments 
        ADD COLUMN IF NOT EXISTS amount_after_gateway_commission_usdt DECIMAL(20,8)
      `;
      console.log('✅ Поле добавлено успешно');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  Поле уже существует, пропускаем...');
      } else {
        throw error;
      }
    }

    // 2. Получаем все PAID платежи без заполненного поля
    console.log('\n📊 Получаем PAID платежи для обновления...');
    
    const paymentsToUpdate = await prisma.payment.findMany({
      where: {
        status: 'PAID',
        amountUSDT: { not: null },
        amountAfterGatewayCommissionUSDT: null
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            gatewaySettings: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`📝 Найдено ${paymentsToUpdate.length} платежей для обновления`);

    if (paymentsToUpdate.length === 0) {
      console.log('✅ Нет платежей для обновления');
      return;
    }

    // 3. Обновляем каждый платеж
    let updatedCount = 0;
    let totalOriginalAmount = 0;
    let totalAfterCommissionAmount = 0;

    for (const payment of paymentsToUpdate) {
      try {
        // Получаем комиссию для данного шлюза
        const commission = getGatewayCommission(payment.shop.gatewaySettings, payment.gateway);
        
        // Рассчитываем сумму после комиссии
        const amountAfterCommission = payment.amountUSDT * (1 - commission / 100);
        
        // Обновляем платеж
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            amountAfterGatewayCommissionUSDT: amountAfterCommission
          }
        });

        totalOriginalAmount += payment.amountUSDT;
        totalAfterCommissionAmount += amountAfterCommission;
        updatedCount++;

        console.log(`✅ Платеж ${payment.id}: ${payment.amountUSDT.toFixed(6)} USDT -> ${amountAfterCommission.toFixed(6)} USDT (комиссия ${commission}%, шлюз ${payment.gateway})`);
        
        // Показываем прогресс каждые 100 платежей
        if (updatedCount % 100 === 0) {
          console.log(`📊 Обновлено ${updatedCount}/${paymentsToUpdate.length} платежей...`);
        }
        
      } catch (error) {
        console.error(`❌ Ошибка при обновлении платежа ${payment.id}:`, error.message);
      }
    }

    // 4. Выводим итоговую статистику
    console.log('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
    console.log(`✅ Успешно обновлено платежей: ${updatedCount}`);
    console.log(`💰 Общая сумма до комиссии: ${totalOriginalAmount.toFixed(6)} USDT`);
    console.log(`💰 Общая сумма после комиссии: ${totalAfterCommissionAmount.toFixed(6)} USDT`);
    console.log(`💸 Общая сумма комиссий: ${(totalOriginalAmount - totalAfterCommissionAmount).toFixed(6)} USDT`);
    console.log(`📈 Средняя комиссия: ${((1 - totalAfterCommissionAmount / totalOriginalAmount) * 100).toFixed(2)}%`);

  } catch (error) {
    console.error('❌ Ошибка во время миграции:', error);
    throw error;
  }
}

// Запуск миграции
async function main() {
  try {
    await migrateAmountAfterCommission();
    console.log('\n🎉 Миграция завершена успешно!');
  } catch (error) {
    console.error('\n💥 Миграция завершилась с ошибкой:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем только если скрипт вызван напрямую
if (require.main === module) {
  main();
}

module.exports = { migrateAmountAfterCommission };
