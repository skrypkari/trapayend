import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/paymentService';
import { MasterCardService } from '../services/gateways/mastercardService';
import { WebhookService } from '../services/webhookService';
import { CreatePublicPaymentRequest } from '../types/payment';
import prisma from '../config/database';

export class PaymentController {
  private paymentService: PaymentService;
  private masterCardService: MasterCardService;
  private webhookService: WebhookService;

  constructor() {
    this.paymentService = new PaymentService();
    this.masterCardService = new MasterCardService();
    this.webhookService = new WebhookService();
  }

  createPublicPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentData: CreatePublicPaymentRequest = req.body;
      const result = await this.paymentService.createPublicPayment(paymentData);
      
      res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        result: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getPaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const payment = await this.paymentService.getPaymentStatus(id);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      res.json({
        success: true,
        result: payment,
      });
    } catch (error) {
      next(error);
    }
  };

  // New method to get payment by ID (either our ID or shop's order ID)
  getPaymentById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const payment = await this.paymentService.getPaymentById(id);
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      res.json({
        success: true,
        result: payment,
      });
    } catch (error) {
      next(error);
    }
  };

  // ✅ НОВОЕ: Update payment customer data (публичный метод)
  updatePaymentCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const customerData = req.body;

      console.log(`🔄 Updating customer data for payment: ${id}`);
      console.log(`📝 Customer data:`, customerData);

      const updatedPayment = await this.paymentService.updatePaymentCustomerDataPublic(id, customerData);

      if (!updatedPayment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      res.json({
        success: true,
        message: 'Customer data updated successfully',
        result: {
          paymentId: updatedPayment.id,
          customerIp: updatedPayment.customerIp,
          customerUa: updatedPayment.customerUa,
          customerCountry: updatedPayment.customerCountry,
          updatedAt: updatedPayment.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ✅ НОВОЕ: Process MasterCard payment with card data
  processMasterCardPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: paymentId } = req.params;
      const { cardData, cardHolder, browser } = req.body;

      console.log(`💳 Processing MasterCard payment: ${paymentId}`);
      console.log(`💳 Card holder: ${cardHolder.first_name} ${cardHolder.last_name} (${cardHolder.email})`);
      console.log(`💳 Browser IP: ${browser.ip}`);

      // ✅ ОБНОВЛЕНО: Сохраняем данные клиента в платеж
      const customerData: any = {
        customerName: `${cardHolder.first_name} ${cardHolder.last_name}`,
        customerEmail: cardHolder.email,
        customerIp: browser.ip,
        customerUa: browser.user_agent,
      };

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
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      if (payment.gateway !== 'mastercard') {
        return res.status(400).json({
          success: false,
          message: 'Payment is not for MasterCard gateway',
        });
      }

      if (payment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: `Payment status is ${payment.status}, cannot process`,
        });
      }

      // ✅ НОВОЕ: Обновляем платеж с данными клиента
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          ...customerData,
          updatedAt: new Date(),
        },
      });

      // Prepare URLs for MasterCard
      const resultUrl = `https://api.trapay.uk/api/webhooks/gateway/mastercard`;
      const returnUrl = payment.successUrl;

      console.log(`💳 MasterCard URLs:`);
      console.log(`   Result URL (webhook): ${resultUrl}`);
      console.log(`   Return URL: ${returnUrl}`);

      // ✅ ОБНОВЛЕНО: Передаем enriched cardHolder с адресными данными по умолчанию
      const enrichedCardHolder = {
        first_name: cardHolder.first_name,
        last_name: cardHolder.last_name,
        email: cardHolder.email
      };

      // Process card payment
      const result = await this.masterCardService.processCardPayment({
        paymentId: payment.id,
        orderId: payment.gatewayOrderId || payment.id,
        amount: payment.amount,
        currency: payment.currency,
        cardData,
        resultUrl,
        returnUrl,
        cardHolder: enrichedCardHolder, 
        browser,
      });

      console.log(`💳 MasterCard result:`, result);

      // Update payment in database
      const updateData: any = {
        status: result.status,
        updatedAt: new Date(),
        statusChangedBy: 'system',
        statusChangedAt: new Date(),
      };

      // ✅ ИСПРАВЛЕНО: Сохраняем gatewayPaymentId всегда, когда он приходит от шлюза
      if (result.gateway_payment_id) {
        updateData.gatewayPaymentId = result.gateway_payment_id;
        console.log(`💳 Saving MasterCard gateway payment ID: ${result.gateway_payment_id}`);
      }

      if (result.status === 'PAID') {
        updateData.paidAt = new Date();
      } else if (result.status === 'FAILED') {
        updateData.failureMessage = 'Card payment failed';
      }

      // Save payment method
      updateData.paymentMethod = 'mastercard';

      // ✅ НОВОЕ: Сохраняем последние 4 цифры карты
      if (cardData.number) {
        const cardNumber = cardData.number.replace(/[\s-]/g, ''); // Убираем пробелы и дефисы
        updateData.cardLast4 = cardNumber.slice(-4); // Берем последние 4 цифры
        console.log(`💳 Saving card last 4 digits: ****${updateData.cardLast4}`);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: updateData,
      });

      // Create webhook log
      await prisma.webhookLog.create({
        data: {
          paymentId: payment.id,
          shopId: payment.shopId,
          event: `mastercard_${result.status?.toLowerCase()}`,
          statusCode: 200,
          responseBody: JSON.stringify({
            oldStatus: 'PENDING',
            newStatus: result.status,
            gatewayPaymentId: result.gateway_payment_id,
            requires3ds: result.requires_3ds,
            processedAt: new Date().toISOString(),
          }),
        },
      });

      // Send webhook to shop and Telegram notification if payment is final
      if (result.final) {
        await this.sendShopWebhook(payment, result.status!, result.gateway_payment_id);
        await this.sendPaymentStatusNotification(payment, result.status!);
        
        // ✅ НОВОЕ: Обновляем счетчик payment link при успешной оплате
        if (result.status === 'PAID') {
          console.log(`📈 MasterCard payment ${paymentId} became PAID, updating payment link counter`);
          
          try {
            const { PaymentLinkService } = await import('../services/paymentLinkService');
            const paymentLinkService = new PaymentLinkService();
            await paymentLinkService.handleSuccessfulPayment(paymentId);
            console.log(`✅ Payment link counter updated for MasterCard payment ${paymentId}`);
          } catch (linkError) {
            console.error('Failed to update payment link counter for MasterCard payment:', linkError);
            // Не прерываем выполнение, если обновление счетчика не удалось
          }
        }
      }

      console.log(`✅ MasterCard payment ${paymentId} processed: ${result.status}`);

      // Return result to client
      if (result.status === 'PAID') {
        res.json({
          success: true,
          message: 'Payment processed successfully',
          result: {
            status: 'PAID',
            gatewayPaymentId: result.gateway_payment_id,
            redirectUrl: returnUrl,
            final: true,
          },
        });
      } else if (result.requires_3ds && result.threeds_url) {
        res.json({
          success: true,
          message: '3DS verification required',
          result: {
            status: 'PENDING',
            gatewayPaymentId: result.gateway_payment_id,
            redirectUrl: result.threeds_url,
            requires3ds: true,
            final: false,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment failed',
          result: {
            status: 'FAILED',
            gatewayPaymentId: result.gateway_payment_id,
            redirectUrl: payment.failUrl,
            final: true,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  };

  private async sendShopWebhook(payment: any, status: string, gatewayPaymentId?: string): Promise<void> {
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
          gateway: '1111', // MasterCard gateway ID
          amount: payment.amount,
          currency: payment.currency,
          status: status.toLowerCase(),
          customer_email: payment.customerEmail,
          customer_name: payment.customerName,
          gateway_payment_id: gatewayPaymentId,
          created_at: payment.createdAt,
          updated_at: new Date(),
        },
      };

      // Send webhook to shop
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (MasterCard)',
        },
        body: JSON.stringify(webhookPayload),
      });

      const responseTime = Date.now() - startTime;

      console.log(`MasterCard webhook sent to ${settings.webhookUrl} with status ${response.status} (${responseTime}ms)`);

    } catch (error) {
      console.error('Failed to send MasterCard webhook:', error);
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