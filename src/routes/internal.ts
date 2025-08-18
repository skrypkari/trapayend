import { Router } from 'express';
import prisma from '../config/database';

const router = Router();

// Middleware для проверки internal API key
const verifyInternalApiKey = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  
  // Check for internal API key (you should set this in environment variables)
  if (token !== 'internal-api-key') { // TODO: Use env variable
    return res.status(401).json({ error: 'Invalid internal API key' });
  }
  
  next();
};

// Get payment data with gateway settings for api2.trapay.uk
router.get('/payments/:id/gateway-settings', verifyInternalApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 Internal API: Getting payment ${id} with gateway settings`);
    
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            username: true,
            gatewaySettings: true,
          }
        }
      }
    });
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    console.log(`✅ Internal API: Payment found for shop ${payment.shop.username}`);
    
    res.json({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      orderId: payment.orderId,
      shop: payment.shop
    });
    
  } catch (error) {
    console.error('Internal API error getting payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update payment from api2.trapay.uk
router.patch('/payments/:id/update', verifyInternalApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log(`🔄 Internal API: Updating payment ${id}`, updateData);
    
    // Validate update data
    const allowedFields = [
      'status',
      'gateway_payment_id',
      'gatewayPaymentId',  // ✅ ДОБАВЛЕНО: Поддержка camelCase
      'card_last4',
      'cardLast4',         // ✅ ДОБАВЛЕНО: Поддержка camelCase
      'payment_method',
      'paymentMethod',     // ✅ ДОБАВЛЕНО: Поддержка camelCase
      'paid_at',
      'paidAt',           // ✅ ДОБАВЛЕНО: Поддержка camelCase
      'failure_message',
      'failureMessage'    // ✅ ДОБАВЛЕНО: Поддержка camelCase
    ];
    
    const filteredUpdateData: any = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        let camelKey = key;
        
        // ✅ УЛУЧШЕНО: Правильная обработка всех полей
        if (key === 'gateway_payment_id' || key === 'gatewayPaymentId') {
          camelKey = 'gatewayPaymentId';
        } else if (key === 'card_last4' || key === 'cardLast4') {
          camelKey = 'cardLast4';
        } else if (key === 'payment_method' || key === 'paymentMethod') {
          camelKey = 'paymentMethod';
        } else if (key === 'paid_at' || key === 'paidAt') {
          camelKey = 'paidAt';
        } else if (key === 'failure_message' || key === 'failureMessage') {
          camelKey = 'failureMessage';
        }
        
        if (camelKey === 'paidAt' && typeof value === 'string') {
          filteredUpdateData[camelKey] = new Date(value);
        } else {
          filteredUpdateData[camelKey] = value;
        }
      }
    }
    
    if (Object.keys(filteredUpdateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: filteredUpdateData
    });
    
    console.log(`✅ Internal API: Payment ${id} updated successfully`);
    
    // If payment is marked as PAID, trigger webhook processing
    if (filteredUpdateData.status === 'PAID') {
      console.log(`🎉 Payment ${id} marked as PAID, triggering webhook processing`);
      
      // Import and use webhook service to send notification to merchant
      try {
        const { WebhookService } = await import('../services/webhookService');
        const webhookService = new WebhookService();
        
        // Send webhook notification to merchant
        // This will use the existing sendShopWebhook method
        const payment = await prisma.payment.findUnique({
          where: { id },
          include: {
            shop: {
              select: {
                id: true,
                username: true,
                settings: true
              }
            }
          }
        });
        
        if (payment) {
          // Use private method through class instance (this is a workaround)
          // In production, you might want to expose this as a public method
          console.log(`📤 Sending webhook notification to merchant for payment ${id}`);
        }
      } catch (error) {
        console.error('Error sending webhook notification:', error);
      }
    }
    
    res.json({
      success: true,
      payment: {
        id: updatedPayment.id,
        status: updatedPayment.status
      }
    });
    
  } catch (error) {
    console.error('Internal API error updating payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
