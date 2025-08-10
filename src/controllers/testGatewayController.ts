import { Request, Response, NextFunction } from 'express';
import { TestGatewayService, TestGatewayCardData } from '../services/gateways/testGatewayService';
import { WebhookService } from '../services/webhookService';
import prisma from '../config/database';

export class TestGatewayController {
  private testGatewayService: TestGatewayService;
  private webhookService: WebhookService;

  constructor() {
    this.testGatewayService = new TestGatewayService();
    this.webhookService = new WebhookService();
  }

  // GET /api/test-gateway/payment/:paymentId - Get payment details for form
  getPaymentForm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentId } = req.params;

      console.log(`🧪 Test Gateway: Getting payment form for ${paymentId}`);

      // Find payment
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          shop: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      if (payment.gateway !== 'test_gateway') {
        return res.status(400).json({
          success: false,
          message: 'Payment is not for test gateway',
        });
      }

      if (payment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: `Payment status is ${payment.status}, cannot process`,
        });
      }

      // Return payment details for form
      res.json({
        success: true,
        result: {
          paymentId: payment.id,
          orderId: payment.gatewayOrderId,
          amount: payment.amount,
          currency: payment.currency,
          merchantName: payment.shop.name,
          description: `Payment to ${payment.shop.name}`,
          testInstructions: {
            successCard: '4242 4242 4242 4242',
            failureCard: 'Any other card number',
            expiryDate: 'Any future date (MM/YY)',
            cvc: 'Any 3-4 digits',
            holderName: 'Any name',
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // POST /api/test-gateway/process-card/:paymentId - Process card payment
  processCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentId } = req.params;
      const cardData: TestGatewayCardData = req.body;

      console.log(`🧪 Test Gateway: Processing card for payment ${paymentId}`);

      // Find payment
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              settings: {
                select: {
                  webhookUrl: true,
                  webhookEvents: true,
                },
              },
            },
          },
        },
        // ✅ ДОБАВЛЕНО: Включаем paymentLinkId для обновления счетчика
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      if (payment.gateway !== 'test_gateway') {
        return res.status(400).json({
          success: false,
          message: 'Payment is not for test gateway',
        });
      }

      if (payment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: `Payment status is ${payment.status}, cannot process`,
        });
      }

      // Process card payment
      const result = await this.testGatewayService.processCardPayment({
        paymentId: payment.id,
        orderId: payment.gatewayOrderId || payment.id,
        amount: payment.amount,
        currency: payment.currency,
        cardData,
      });

      console.log(`🧪 Test Gateway result:`, result);

      // Update payment in database
      const updateData: any = {
        status: result.status,
        updatedAt: new Date(),
      };

      if (result.status === 'PAID') {
        updateData.paidAt = new Date();
        updateData.gatewayPaymentId = result.transactionId;
      } else if (result.status === 'FAILED') {
        updateData.failureMessage = result.failureReason;
      }

      // Save card details (last 4 digits only for security)
      const cleanCardNumber = cardData.cardNumber.replace(/[\s-]/g, '');
      updateData.cardLast4 = cleanCardNumber.slice(-4);
      updateData.paymentMethod = 'test_card';

      await prisma.payment.update({
        where: { id: payment.id },
        data: updateData,
      });

      // ✅ ДОБАВЛЕНО: Обновляем payment link counter для test gateway
      if (result.status === 'PAID' && payment.paymentLinkId) {
        console.log(`📈 Test Gateway: Payment ${payment.id} became PAID, updating payment link counter`);
        
        try {
          await prisma.$transaction(async (tx) => {
            // Получаем текущую payment link
            const paymentLink = await tx.paymentLink.findUnique({
              where: { id: payment.paymentLinkId! }, // ! означает что мы уверены что не null
              select: { 
                id: true, 
                type: true, 
                currentPayments: true, 
                status: true 
              },
            });

            if (paymentLink) {
              console.log(`📈 Found payment link ${paymentLink.id}: type=${paymentLink.type}, currentPayments=${paymentLink.currentPayments}, status=${paymentLink.status}`);

              // Увеличиваем счетчик платежей
              const newCurrentPayments = paymentLink.currentPayments + 1;
              
              // Для SINGLE ссылок устанавливаем статус COMPLETED
              const newLinkStatus = (paymentLink.type === 'SINGLE') ? 'COMPLETED' : paymentLink.status;

              await tx.paymentLink.update({
                where: { id: payment.paymentLinkId! }, // ! означает что мы уверены что не null
                data: {
                  currentPayments: newCurrentPayments,
                  status: newLinkStatus,
                  updatedAt: new Date(),
                },
              });

              console.log(`✅ Payment link ${paymentLink.id} updated: currentPayments=${paymentLink.currentPayments} -> ${newCurrentPayments}, status=${paymentLink.status} -> ${newLinkStatus}`);
            } else {
              console.log(`❌ Payment link ${payment.paymentLinkId} not found`);
            }
          });
        } catch (linkError) {
          console.error('❌ Failed to update payment link counter for test gateway:', linkError);
        }
      }

      // Create webhook log
      await prisma.webhookLog.create({
        data: {
          paymentId: payment.id,
          shopId: payment.shopId,
          event: `test_gateway_${result.status.toLowerCase()}`,
          statusCode: 200,
          responseBody: JSON.stringify({
            oldStatus: 'PENDING',
            newStatus: result.status,
            transactionId: result.transactionId,
            failureReason: result.failureReason,
            processedAt: new Date().toISOString(),
          }),
        },
      });

      // Send webhook to shop and Telegram notification
      await this.sendShopWebhook(payment, result.status, result.transactionId, result.failureReason);
      await this.sendPaymentStatusNotification(payment, result.status);

      console.log(`✅ Test Gateway payment ${paymentId} processed: ${result.status}`);

      // Return result to client
      if (result.status === 'PAID') {
        res.json({
          success: true,
          message: 'Payment processed successfully',
          result: {
            status: 'PAID',
            transactionId: result.transactionId,
            redirectUrl: payment.successUrl,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment failed',
          result: {
            status: 'FAILED',
            failureReason: result.failureReason,
            redirectUrl: payment.failUrl,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  };

  private async sendShopWebhook(payment: any, status: string, transactionId?: string, failureReason?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const shop = payment.shop;
      const settings = shop.settings;

      if (!settings?.webhookUrl) {
        console.log(`No webhook URL configured for shop ${shop.id}`);
        return;
      }

      // Check if this event type is enabled
      const eventName = status === 'PAID' ? 'payment.success' : 'payment.failed';

      // Parse webhook events
      let webhookEvents: string[] = [];
      if (settings.webhookEvents) {
        try {
          webhookEvents = Array.isArray(settings.webhookEvents) 
            ? settings.webhookEvents 
            : JSON.parse(settings.webhookEvents as string);
        } catch (error) {
          console.error('Error parsing webhook events:', error);
          webhookEvents = [];
        }
      }

      if (!webhookEvents.includes(eventName)) {
        console.log(`Webhook event ${eventName} not enabled for shop ${shop.id}`);
        return;
      }

      // Prepare webhook payload for shop
      const webhookPayload = {
        event: eventName,
        payment: {
          id: payment.id,
          order_id: payment.orderId,
          gateway_order_id: payment.gatewayOrderId,
          gateway: '0000', // Test Gateway ID
          amount: payment.amount,
          currency: payment.currency,
          status: status.toLowerCase(),
          customer_email: payment.customerEmail,
          customer_name: payment.customerName,
          transaction_id: transactionId,
          failure_message: failureReason,
          created_at: payment.createdAt,
          updated_at: new Date(),
        },
      };

      // Send webhook to shop
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (Test Gateway)',
        },
        body: JSON.stringify(webhookPayload),
      });

      const responseTime = Date.now() - startTime;

      console.log(`Test Gateway webhook sent to ${settings.webhookUrl} with status ${response.status} (${responseTime}ms)`);

    } catch (error) {
      console.error('Failed to send Test Gateway webhook:', error);
    }
  }

  private async sendPaymentStatusNotification(payment: any, status: string): Promise<void> {
    try {
      const { telegramBotService } = await import('../services/telegramBotService');
      
      const statusMap: Record<string, 'paid' | 'failed'> = {
        'PAID': 'paid',
        'FAILED': 'failed',
      };

      const telegramStatus = statusMap[status];
      if (!telegramStatus) return;

      await telegramBotService.sendPaymentNotification(payment.shopId, payment, telegramStatus);
    } catch (error) {
      console.error('Failed to send Telegram payment notification:', error);
    }
  }
}