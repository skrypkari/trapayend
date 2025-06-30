import prisma from '../config/database';
import { PlisioService } from './gateways/plisioService';
import { RapydService } from './gateways/rapydService';
import { NodaService } from './gateways/nodaService';
import { CoinToPayService } from './gateways/coinToPayService';
import { KlymeService } from './gateways/klymeService';
import { telegramBotService } from './telegramBotService';
import { PaymentLinkService } from './paymentLinkService';
import { loggerService } from './loggerService';

export class WebhookService {
  private plisioService: PlisioService;
  private rapydService: RapydService;
  private nodaService: NodaService;
  private coinToPayService: CoinToPayService;
  private klymeService: KlymeService;
  private paymentLinkService: PaymentLinkService;

  constructor() {
    this.plisioService = new PlisioService();
    this.rapydService = new RapydService();
    this.nodaService = new NodaService();
    this.coinToPayService = new CoinToPayService();
    this.klymeService = new KlymeService();
    this.paymentLinkService = new PaymentLinkService();
  }

  // ✅ ОБНОВЛЕНО: Plisio webhook processing with tx_urls support
  async processPlisioWebhook(webhookData: any): Promise<void> {
    console.log('Processing Plisio webhook:', webhookData);

    try {
      const result = await this.plisioService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in Plisio webhook');
        return;
      }

      // ✅ НОВОЕ: Передаем tx_urls в updatePaymentStatus
      await this.updatePaymentStatus(
        result.paymentId, 
        result.status, 
        'plisio', 
        webhookData,
        undefined, // failureMessage
        undefined, // additionalInfo
        result.txUrls // ✅ НОВОЕ: tx_urls
      );
      
      loggerService.logWebhookProcessed('plisio', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing Plisio webhook:', error);
      loggerService.logWebhookError('plisio', error, webhookData);
      throw error;
    }
  }

  // ✅ ОБНОВЛЕНО: Plisio Gateway webhook processing with tx_urls support
  async processPlisioGatewayWebhook(webhookData: any): Promise<void> {
    console.log('Processing Plisio Gateway webhook:', webhookData);

    try {
      const result = await this.plisioService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in Plisio Gateway webhook');
        return;
      }

      // ✅ НОВОЕ: Передаем tx_urls в updatePaymentStatus
      await this.updatePaymentStatus(
        result.paymentId, 
        result.status, 
        'plisio', 
        webhookData,
        undefined, // failureMessage
        undefined, // additionalInfo
        result.txUrls // ✅ НОВОЕ: tx_urls
      );
      
      loggerService.logWebhookProcessed('plisio_gateway', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing Plisio Gateway webhook:', error);
      loggerService.logWebhookError('plisio_gateway', error, webhookData);
      throw error;
    }
  }

  // ✅ ОБНОВЛЕНО: Rapyd webhook processing with failure_message support
  async processRapydWebhook(webhookData: any): Promise<void> {
    console.log('Processing Rapyd webhook:', webhookData);

    try {
      const result = await this.rapydService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in Rapyd webhook');
        return;
      }

      // ✅ НОВОЕ: Передаем failure_message и дополнительную информацию
      await this.updatePaymentStatus(
        result.paymentId, 
        result.status, 
        'rapyd', 
        webhookData,
        result.failureMessage, // ✅ НОВОЕ: failure_message
        result.additionalInfo   // ✅ НОВОЕ: дополнительная информация
      );
      
      loggerService.logWebhookProcessed('rapyd', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing Rapyd webhook:', error);
      loggerService.logWebhookError('rapyd', error, webhookData);
      throw error;
    }
  }

  async processNodaWebhook(webhookData: any): Promise<void> {
    console.log('Processing Noda webhook:', webhookData);

    try {
      const result = await this.nodaService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in Noda webhook');
        return;
      }

      await this.updatePaymentStatus(result.paymentId, result.status, 'noda', webhookData, undefined, result.additionalInfo);
      
      loggerService.logWebhookProcessed('noda', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing Noda webhook:', error);
      loggerService.logWebhookError('noda', error, webhookData);
      throw error;
    }
  }

  async processCoinToPayWebhook(webhookData: any): Promise<void> {
    console.log('Processing CoinToPay webhook:', webhookData);

    try {
      const result = await this.coinToPayService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in CoinToPay webhook');
        return;
      }

      await this.updatePaymentStatus(result.paymentId, result.status, 'cointopay', webhookData);
      
      loggerService.logWebhookProcessed('cointopay', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing CoinToPay webhook:', error);
      loggerService.logWebhookError('cointopay', error, webhookData);
      throw error;
    }
  }

  async processKlymeWebhook(webhookData: any): Promise<void> {
    console.log('Processing KLYME webhook:', webhookData);

    try {
      const result = await this.klymeService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        console.error('No payment ID found in KLYME webhook');
        return;
      }

      const gatewayName = result.region ? `klyme_${result.region.toLowerCase()}` : 'klyme_eu';
      await this.updatePaymentStatus(result.paymentId, result.status, gatewayName, webhookData, undefined, result.additionalInfo);
      
      loggerService.logWebhookProcessed('klyme', result.paymentId, 'PENDING', result.status, webhookData);
    } catch (error) {
      console.error('Error processing KLYME webhook:', error);
      loggerService.logWebhookError('klyme', error, webhookData);
      throw error;
    }
  }

  // ✅ ОБНОВЛЕНО: Updated updatePaymentStatus method with tx_urls support
  private async updatePaymentStatus(
    paymentId: string, 
    newStatus: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED', 
    gateway: string, 
    webhookData: any,
    failureMessage?: string, // ✅ НОВОЕ: failure_message
    additionalInfo?: any,    // ✅ НОВОЕ: дополнительная информация
    txUrls?: string[]        // ✅ НОВОЕ: transaction URLs
  ): Promise<void> {
    console.log(`🔄 Updating payment ${paymentId} status to ${newStatus} from ${gateway} webhook`);
    
    if (failureMessage) {
      console.log(`💥 Payment ${paymentId} failure message: ${failureMessage}`);
    }
    
    if (txUrls && txUrls.length > 0) {
      console.log(`🔗 Payment ${paymentId} transaction URLs:`, txUrls);
    }

    // Find payment by gatewayOrderId (8digits-8digits format)
    const payment = await prisma.payment.findFirst({
      where: {
        gatewayOrderId: paymentId,
        gateway: gateway,
      },
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
      console.error(`Payment not found for gatewayOrderId: ${paymentId} and gateway: ${gateway}`);
      return;
    }

    const oldStatus = payment.status;
    
    // Only update if status actually changed
    if (oldStatus === newStatus) {
      console.log(`Payment ${payment.id} status unchanged (${newStatus})`);
      return;
    }

    console.log(`Payment ${payment.id} status change: ${oldStatus} -> ${newStatus}`);

    // ✅ НОВОЕ: Подготавливаем данные для обновления с failure_message и tx_urls
    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // ✅ НОВОЕ: Добавляем failure_message если есть
    if (failureMessage) {
      updateData.failureMessage = failureMessage;
      console.log(`💾 Saving failure message: ${failureMessage}`);
    }

    // ✅ НОВОЕ: Добавляем tx_urls если есть
    if (txUrls && txUrls.length > 0) {
      updateData.txUrls = JSON.stringify(txUrls);
      console.log(`💾 Saving transaction URLs: ${JSON.stringify(txUrls)}`);
    }

    // Set paidAt if payment became successful
    if (newStatus === 'PAID' && oldStatus !== 'PAID') {
      updateData.paidAt = new Date();
    }

    // ✅ НОВОЕ: Обновляем дополнительную информацию если есть
    if (additionalInfo) {
      if (additionalInfo.cardLast4) {
        updateData.cardLast4 = additionalInfo.cardLast4;
      }
      if (additionalInfo.paymentMethod) {
        updateData.paymentMethod = additionalInfo.paymentMethod;
      }
      if (additionalInfo.bankId) {
        updateData.bankId = additionalInfo.bankId;
      }
      if (additionalInfo.remitterIban) {
        updateData.remitterIban = additionalInfo.remitterIban;
      }
      if (additionalInfo.remitterName) {
        updateData.remitterName = additionalInfo.remitterName;
      }
    }

    // Update payment in database
    await prisma.payment.update({
      where: { id: payment.id },
      data: updateData,
    });

    // Handle payment link counter update for successful payments
    if (newStatus === 'PAID' && oldStatus !== 'PAID') {
      try {
        await this.paymentLinkService.handleSuccessfulPayment(payment.id);
      } catch (linkError) {
        console.error('Failed to update payment link counter:', linkError);
      }
    }

    // Log webhook
    await prisma.webhookLog.create({
      data: {
        paymentId: payment.id,
        shopId: payment.shopId,
        event: `${gateway}_webhook_${newStatus.toLowerCase()}`,
        statusCode: 200,
        responseBody: JSON.stringify({
          oldStatus,
          newStatus,
          failureMessage, // ✅ НОВОЕ: Логируем failure_message
          txUrls,         // ✅ НОВОЕ: Логируем tx_urls
          webhookData,
        }),
      },
    });

    // Send webhook to shop
    await this.sendShopWebhook(payment, newStatus);

    // Send Telegram notification
    await this.sendPaymentStatusNotification(payment, newStatus);

    console.log(`✅ Payment ${payment.id} updated successfully: ${oldStatus} -> ${newStatus}`);
    
    if (failureMessage) {
      console.log(`💾 Failure message saved: ${failureMessage}`);
    }
    
    if (txUrls && txUrls.length > 0) {
      console.log(`💾 Transaction URLs saved: ${txUrls.length} URLs`);
    }
  }

  private async sendShopWebhook(payment: any, status: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const shop = payment.shop;
      const settings = shop.settings;

      if (!settings?.webhookUrl) {
        console.log(`No webhook URL configured for shop ${shop.id}`);
        return;
      }

      // Check if this event type is enabled
      const eventName = status === 'PAID' ? 'payment.success' : 
                       status === 'FAILED' ? 'payment.failed' : 
                       status === 'EXPIRED' ? 'payment.failed' : 'payment.pending';

      // Parse webhook events (handle JSON for MySQL)
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

      // ✅ НОВОЕ: Парсим tx_urls для отправки в webhook
      let txUrls: string[] | undefined;
      if (payment.txUrls) {
        try {
          txUrls = JSON.parse(payment.txUrls);
        } catch (error) {
          console.error('Error parsing tx_urls for webhook:', error);
          txUrls = undefined;
        }
      }

      // Prepare webhook payload for shop
      const webhookPayload = {
        event: eventName,
        payment: {
          id: payment.id,
          order_id: payment.orderId,
          gateway_order_id: payment.gatewayOrderId,
          gateway: payment.gateway,
          amount: payment.amount,
          currency: payment.currency,
          status: status.toLowerCase(),
          customer_email: payment.customerEmail,
          customer_name: payment.customerName,
          failure_message: payment.failureMessage, // ✅ НОВОЕ: Добавляем failure_message в webhook
          tx_urls: txUrls, // ✅ НОВОЕ: Добавляем tx_urls в webhook
          created_at: payment.createdAt,
          updated_at: new Date(),
        },
      };

      // Send webhook to shop
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0',
        },
        body: JSON.stringify(webhookPayload),
      });

      const responseTime = Date.now() - startTime;
      const responseText = response.ok ? 'Success' : await response.text();

      // Log shop webhook
      loggerService.logShopWebhookSent(
        payment.shopId,
        settings.webhookUrl,
        eventName,
        response.status,
        responseTime,
        webhookPayload
      );

      console.log(`Shop webhook sent to ${settings.webhookUrl} with status ${response.status} (${responseTime}ms)`);

    } catch (error) {
      console.error('Failed to send shop webhook:', error);
      
      // Log shop webhook error
      loggerService.logShopWebhookError(
        payment.shopId,
        payment.shop?.settings?.webhookUrl || 'unknown',
        'webhook_send',
        error,
        {}
      );
    }
  }

  private async sendPaymentStatusNotification(payment: any, status: string): Promise<void> {
    try {
      const statusMap: Record<string, 'created' | 'paid' | 'failed' | 'expired'> = {
        'PENDING': 'created',
        'PAID': 'paid',
        'FAILED': 'failed',
        'EXPIRED': 'expired',
      };

      const telegramStatus = statusMap[status];
      if (!telegramStatus || telegramStatus === 'created') return;

      await telegramBotService.sendPaymentNotification(payment.shopId, payment, telegramStatus);
    } catch (error) {
      console.error('Failed to send Telegram payment notification:', error);
    }
  }
}