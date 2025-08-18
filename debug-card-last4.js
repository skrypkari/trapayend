// Проверка конкретного платежа на наличие cardLast4
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugCardLast4() {
  try {
    const paymentId = 'cmedda5kv0070m5spb3jaona5'; // ID из вашего примера
    
    console.log(`🔍 Checking payment ${paymentId} for cardLast4...`);
    
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        gateway: true,
        gatewayPaymentId: true,
        cardLast4: true,
        paymentMethod: true,
        customerIp: true,
        customerUa: true,
        customerCountry: true,
        failureMessage: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!payment) {
      console.log('❌ Payment not found');
      return;
    }
    
    console.log(`\n📊 Payment Details:`);
    console.log(`   ID: ${payment.id}`);
    console.log(`   Status: ${payment.status}`);
    console.log(`   Gateway: ${payment.gateway}`);
    console.log(`   Gateway Payment ID: ${payment.gatewayPaymentId || 'null'}`);
    console.log(`   Card Last 4: ${payment.cardLast4 || 'null'}`);
    console.log(`   Payment Method: ${payment.paymentMethod || 'null'}`);
    console.log(`   Customer IP: ${payment.customerIp || 'null'}`);
    console.log(`   Customer Country: ${payment.customerCountry || 'null'}`);
    console.log(`   Created: ${payment.createdAt}`);
    console.log(`   Updated: ${payment.updatedAt}`);
    
    if (payment.failureMessage) {
      console.log(`   Failure Message: ${payment.failureMessage}`);
    }
    
    // Проверим недавние Amer платежи с cardLast4
    console.log(`\n🔍 Recent Amer payments with cardLast4:`);
    const recentAmerPayments = await prisma.payment.findMany({
      where: {
        gateway: 'amer',
        cardLast4: { not: null }
      },
      select: {
        id: true,
        status: true,
        cardLast4: true,
        paymentMethod: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    recentAmerPayments.forEach(p => {
      console.log(`   ${p.id}: status=${p.status}, cardLast4=${p.cardLast4}, method=${p.paymentMethod}, created=${p.createdAt}`);
    });
    
    // Проверим недавние Amer платежи БЕЗ cardLast4
    console.log(`\n⚠️ Recent Amer payments WITHOUT cardLast4:`);
    const amerWithoutCard = await prisma.payment.findMany({
      where: {
        gateway: 'amer',
        cardLast4: null
      },
      select: {
        id: true,
        status: true,
        cardLast4: true,
        paymentMethod: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    amerWithoutCard.forEach(p => {
      console.log(`   ${p.id}: status=${p.status}, cardLast4=${p.cardLast4}, method=${p.paymentMethod}, created=${p.createdAt}`);
    });
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
  }
}

debugCardLast4();
