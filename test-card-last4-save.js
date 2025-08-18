const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testCardLast4Save() {
  console.log('🧪 Testing cardLast4 save functionality...\n');
  
  // Find the most recent payment
  const recentPayment = await prisma.payment.findFirst({
    where: {
      gateway: 'amer'
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  if (recentPayment) {
    console.log('🔍 Most recent Amer payment:');
    console.log(`   ID: ${recentPayment.id}`);
    console.log(`   Status: ${recentPayment.status}`);
    console.log(`   CardLast4: ${recentPayment.cardLast4}`);
    console.log(`   Payment method: ${recentPayment.paymentMethod}`);
    console.log(`   Created: ${recentPayment.createdAt}`);
    console.log(`   Updated: ${recentPayment.updatedAt}`);
    console.log(`   Gateway Order ID: ${recentPayment.gatewayOrderId}`);
    
    // Manually update cardLast4 for testing
    console.log('\n🔧 Manually updating cardLast4 for testing...');
    
    const updated = await prisma.payment.update({
      where: { id: recentPayment.id },
      data: {
        cardLast4: '4891', // From the logs we saw
        paymentMethod: 'card'
      }
    });
    
    console.log('✅ Updated payment:');
    console.log(`   CardLast4: ${updated.cardLast4}`);
    console.log(`   Payment method: ${updated.paymentMethod}`);
  } else {
    console.log('❌ No Amer payments found');
  }
  
  await prisma.$disconnect();
}

testCardLast4Save().catch(console.error);
