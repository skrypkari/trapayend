// Скрипт для исправления статусов payment links
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPaymentLinkStatuses() {
  try {
    console.log('🔧 Starting payment link status fix...');
    
    // Получаем все payment links типа SINGLE которые имеют статус ACTIVE
    const singleLinks = await prisma.paymentLink.findMany({
      where: {
        type: 'SINGLE',
        status: 'ACTIVE'
      },
      include: {
        payments: {
          where: {
            status: 'PAID'
          }
        }
      }
    });
    
    console.log(`📊 Found ${singleLinks.length} SINGLE payment links with ACTIVE status`);
    
    let updatedCount = 0;
    
    for (const link of singleLinks) {
      const paidPayments = link.payments.filter(p => p.status === 'PAID');
      
      console.log(`\n📋 Processing payment link ${link.id}:`);
      console.log(`   - Type: ${link.type}`);
      console.log(`   - Current status: ${link.status}`);
      console.log(`   - Current payments counter: ${link.currentPayments}`);
      console.log(`   - Actual paid payments: ${paidPayments.length}`);
      
      if (paidPayments.length > 0) {
        // Для SINGLE ссылок с оплаченными платежами устанавливаем статус COMPLETED
        await prisma.paymentLink.update({
          where: { id: link.id },
          data: {
            status: 'COMPLETED',
            currentPayments: paidPayments.length,
            updatedAt: new Date()
          }
        });
        
        console.log(`   ✅ Updated: status=COMPLETED, currentPayments=${paidPayments.length}`);
        updatedCount++;
      } else {
        console.log(`   ℹ️  No paid payments, keeping ACTIVE status`);
      }
    }
    
    console.log(`\n✅ Payment link status fix completed!`);
    console.log(`📊 Updated ${updatedCount} payment links`);
    
    // Проверяем результат
    const completedLinks = await prisma.paymentLink.count({
      where: {
        type: 'SINGLE',
        status: 'COMPLETED'
      }
    });
    
    const activeLinks = await prisma.paymentLink.count({
      where: {
        type: 'SINGLE',
        status: 'ACTIVE'
      }
    });
    
    console.log(`\n📈 Final statistics:`);
    console.log(`   - SINGLE links with COMPLETED status: ${completedLinks}`);
    console.log(`   - SINGLE links with ACTIVE status: ${activeLinks}`);
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error fixing payment link statuses:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixPaymentLinkStatuses();
