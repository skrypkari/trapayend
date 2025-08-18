// Проверка и добавление последних 4 цифр карты для MasterCard и Amer платежей
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCardLast4() {
  try {
    console.log('🔍 Checking cardLast4 field in payments...');
    
    // Получаем статистику по полю cardLast4
    const totalPayments = await prisma.payment.count();
    const paymentsWithCardLast4 = await prisma.payment.count({
      where: {
        cardLast4: {
          not: null
        }
      }
    });
    
    console.log(`📊 Total payments: ${totalPayments}`);
    console.log(`📊 Payments with cardLast4: ${paymentsWithCardLast4}`);
    
    // Получаем статистику по шлюзам MasterCard и Amer
    const mastercardPayments = await prisma.payment.findMany({
      where: {
        gateway: 'mastercard'
      },
      select: {
        id: true,
        gateway: true,
        status: true,
        cardLast4: true,
        paymentMethod: true,
        createdAt: true
      },
      take: 10
    });
    
    console.log(`\n🏦 MasterCard payments (last 10):`);
    mastercardPayments.forEach(payment => {
      console.log(`   ${payment.id}: status=${payment.status}, cardLast4=${payment.cardLast4 || 'null'}, method=${payment.paymentMethod || 'null'}`);
    });
    
    const amerPayments = await prisma.payment.findMany({
      where: {
        gateway: 'amer'
      },
      select: {
        id: true,
        gateway: true,
        status: true,
        cardLast4: true,
        paymentMethod: true,
        createdAt: true
      },
      take: 10
    });
    
    console.log(`\n🏦 Amer payments (last 10):`);
    amerPayments.forEach(payment => {
      console.log(`   ${payment.id}: status=${payment.status}, cardLast4=${payment.cardLast4 || 'null'}, method=${payment.paymentMethod || 'null'}`);
    });
    
    // Получаем примеры успешных платежей без cardLast4
    const paidWithoutCardLast4 = await prisma.payment.findMany({
      where: {
        status: 'PAID',
        gateway: {
          in: ['mastercard', 'amer']
        },
        cardLast4: null
      },
      select: {
        id: true,
        gateway: true,
        status: true,
        cardLast4: true,
        paymentMethod: true,
        paidAt: true
      },
      take: 5
    });
    
    console.log(`\n⚠️ PAID payments without cardLast4 (${paidWithoutCardLast4.length} found):`);
    paidWithoutCardLast4.forEach(payment => {
      console.log(`   ${payment.id}: gateway=${payment.gateway}, paidAt=${payment.paidAt}`);
    });
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error checking cardLast4:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkCardLast4();
