import prisma from '../config/database';
import { PlisioService } from './gateways/plisioService';
import { RapydService } from './gateways/rapydService';
import { NodaService } from './gateways/nodaService';
import { CoinToPayService } from './gateways/coinToPayService';
import { CoinToPay2Service } from './gateways/coinToPay2Service';
import { KlymeService } from './gateways/klymeService';
import { MasterCardService } from './gateways/mastercardService';
import { AmerService } from './gateways/amerService';
import { telegramBotService } from './telegramBotService';
import { currencyService } from './currencyService';
import { loggerService } from './loggerService';

export class WebhookService {
  private plisioService: PlisioService;
  private rapydService: RapydService;
  private nodaService: NodaService;
  private coinToPayService: CoinToPayService;
  private coinToPay2Service: CoinToPay2Service;
  private klymeService: KlymeService;
  private masterCardService: MasterCardService;
  private amerService: AmerService;

  constructor() {
    this.plisioService = new PlisioService();
    this.rapydService = new RapydService();
    this.nodaService = new NodaService();
    this.coinToPayService = new CoinToPayService();
    this.coinToPay2Service = new CoinToPay2Service();
    this.klymeService = new KlymeService();
    this.masterCardService = new MasterCardService();
    this.amerService = new AmerService();
  }

  // ✅ НОВОЕ: Универсальный метод для обновления статуса платежа с управлением балансом
  private async updatePaymentStatus(
    paymentId: string,
    newStatus: string,
    additionalData?: {
      failureMessage?: string;
      txUrls?: string[];
      cardLast4?: string;
      paymentMethod?: string;
      bankId?: string;
      remitterIban?: string;
      remitterName?: string;
      chargebackAmount?: number;
    }
  ): Promise<void> {
    console.log(`🔄 updatePaymentStatus called: paymentId=${paymentId}, newStatus=${newStatus}`);
    console.log(`🔄 Additional data:`, additionalData);

    await prisma.$transaction(async (tx) => {
      // Получаем текущий платеж с информацией о магазине
      const currentPayment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              username: true,
              balance: true,
              totalPaidOut: true,
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

      if (!currentPayment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      const oldStatus = currentPayment.status;
      const shop = currentPayment.shop;

      console.log(`💰 Payment ${paymentId}: ${oldStatus} -> ${newStatus}`);
      console.log(`🏪 Shop ${shop.username} current balance: ${shop.balance} USDT`);

      // Подготавливаем данные для обновления платежа
      const paymentUpdateData: any = {
        status: newStatus.toUpperCase(),
        updatedAt: new Date(),
        statusChangedBy: 'system',
        statusChangedAt: new Date(),
      };

      // Добавляем дополнительные данные если они есть
      if (additionalData?.failureMessage) {
        paymentUpdateData.failureMessage = additionalData.failureMessage;
      }
      if (additionalData?.txUrls) {
        paymentUpdateData.txUrls = JSON.stringify(additionalData.txUrls);
      }
      if (additionalData?.cardLast4) {
        paymentUpdateData.cardLast4 = additionalData.cardLast4;
      }
      if (additionalData?.paymentMethod) {
        paymentUpdateData.paymentMethod = additionalData.paymentMethod;
      }
      if (additionalData?.bankId) {
        paymentUpdateData.bankId = additionalData.bankId;
      }
      if (additionalData?.remitterIban) {
        paymentUpdateData.remitterIban = additionalData.remitterIban;
      }
      if (additionalData?.remitterName) {
        paymentUpdateData.remitterName = additionalData.remitterName;
      }

      // Подготавливаем данные для обновления баланса магазина
      let newBalance = shop.balance;
      let balanceChangeReason = '';

      // ✅ ЛОГИКА УПРАВЛЕНИЯ БАЛАНСОМ
      
      // 1. Если платеж становится PAID (и раньше не был PAID)
      if (newStatus.toUpperCase() === 'PAID' && oldStatus !== 'PAID') {
        // Конвертируем сумму в USDT
        const amountUSDT = await currencyService.convertToUSDT(
          currentPayment.amount,
          currentPayment.currency
        );

        // Получаем комиссию шлюза для этого магазина
        const gatewayCommission = await this.getGatewayCommission(shop.id, currentPayment.gateway);
        
        // Рассчитываем сумму с учетом комиссии шлюза (сумму, которую получит мерчант)
        const amountAfterGatewayCommissionUSDT = amountUSDT * (1 - gatewayCommission / 100);

        // Добавляем к балансу сумму ПОСЛЕ вычета комиссии
        newBalance += amountAfterGatewayCommissionUSDT;
        balanceChangeReason = `+${amountAfterGatewayCommissionUSDT.toFixed(6)} USDT (payment became PAID, after ${gatewayCommission}% gateway commission)`;

        // Сохраняем обе суммы в платеже
        paymentUpdateData.amountUSDT = amountUSDT;
        paymentUpdateData.amountAfterGatewayCommissionUSDT = amountAfterGatewayCommissionUSDT;
        paymentUpdateData.paidAt = new Date();

        console.log(`💰 Converting ${currentPayment.amount} ${currentPayment.currency} -> ${amountUSDT.toFixed(6)} USDT`);
        console.log(`💰 Gateway ${currentPayment.gateway} commission: ${gatewayCommission}%`);
        console.log(`💰 Amount after gateway commission: ${amountAfterGatewayCommissionUSDT.toFixed(6)} USDT`);
        console.log(`💰 Adding to balance: ${shop.balance} + ${amountAfterGatewayCommissionUSDT.toFixed(6)} = ${newBalance.toFixed(6)} USDT`);
      }

      // 2. Если платеж был PAID и становится не-PAID
      else if (oldStatus === 'PAID' && newStatus.toUpperCase() !== 'PAID') {
        // Используем amountAfterGatewayCommissionUSDT если доступна, иначе рассчитываем
        let amountToRemove: number;
        
        if ((currentPayment as any).amountAfterGatewayCommissionUSDT) {
          // Используем уже рассчитанную сумму с учетом комиссии
          amountToRemove = (currentPayment as any).amountAfterGatewayCommissionUSDT;
        } else if (currentPayment.amountUSDT) {
          // Если новое поле еще не заполнено, рассчитываем комиссию
          const gatewayCommission = await this.getGatewayCommission(shop.id, currentPayment.gateway);
          amountToRemove = currentPayment.amountUSDT * (1 - gatewayCommission / 100);
        } else {
          console.log('No amountUSDT found for payment, nothing to remove from balance');
          amountToRemove = 0;
        }
        
        if (amountToRemove > 0) {
          // Вычитаем из баланса сумму, которую мерчант получил (после комиссии)
          newBalance -= amountToRemove;
          balanceChangeReason = `-${amountToRemove.toFixed(6)} USDT (payment no longer PAID)`;

          // Очищаем поля
          paymentUpdateData.amountUSDT = null;
          paymentUpdateData.amountAfterGatewayCommissionUSDT = null;
          paymentUpdateData.paidAt = null;

          console.log(`💰 Removing from balance: ${shop.balance} - ${amountToRemove.toFixed(6)} = ${newBalance.toFixed(6)} USDT`);
        }
      }

      // 3. Специальная обработка CHARGEBACK
      if (newStatus.toUpperCase() === 'CHARGEBACK') {
        const chargebackAmount = additionalData?.chargebackAmount || 0;
        
        if (chargebackAmount > 0) {
          newBalance -= chargebackAmount;
          balanceChangeReason += ` and -${chargebackAmount.toFixed(6)} USDT (chargeback penalty)`;
          paymentUpdateData.chargebackAmount = chargebackAmount;

          console.log(`💸 Additional chargeback penalty: -${chargebackAmount.toFixed(6)} USDT`);
          console.log(`💰 Final balance after chargeback: ${newBalance.toFixed(6)} USDT`);
        }
      }

      // Обновляем платеж
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: paymentUpdateData,
      });

      // Обновляем баланс магазина (если он изменился)
      if (newBalance !== shop.balance) {
        await tx.shop.update({
          where: { id: shop.id },
          data: { balance: newBalance },
        });

        console.log(`✅ Shop ${shop.username} balance updated: ${shop.balance.toFixed(6)} -> ${newBalance.toFixed(6)} USDT`);
        console.log(`📝 Reason: ${balanceChangeReason}`);
      }

      // Логируем изменение статуса
      await tx.webhookLog.create({
        data: {
          paymentId: paymentId,
          shopId: shop.id,
          event: `webhook_status_change_${newStatus.toLowerCase()}`,
          statusCode: 200,
          responseBody: JSON.stringify({
            oldStatus,
            newStatus: newStatus.toUpperCase(),
            balanceChange: balanceChangeReason || 'no balance change',
            oldBalance: shop.balance,
            newBalance: newBalance,
            amountUSDT: paymentUpdateData.amountUSDT,
            additionalData,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      // Отправляем webhook мерчанту
      await this.sendShopWebhook(
        { ...currentPayment, ...updatedPayment, shop },
        newStatus.toUpperCase()
      );

      // Отправляем Telegram уведомление
      await this.sendPaymentStatusNotification(
        { ...currentPayment, ...updatedPayment },
        newStatus.toUpperCase()
      );

      // ✅ ОБНОВЛЕНО: Обновляем счетчик и статус payment link при успешной оплате через webhook
      if (oldStatus !== 'PAID' && newStatus.toUpperCase() === 'PAID') {
        console.log(`📈 Payment ${paymentId} became PAID via webhook, updating payment link counter`);
        console.log(`📈 Payment details: oldStatus="${oldStatus}", newStatus="${newStatus.toUpperCase()}", paymentLinkId="${currentPayment.paymentLinkId}"`);
        
        // Простое прямое обновление payment link в той же транзакции
        if (currentPayment.paymentLinkId) {
          try {
            // Получаем текущую payment link
            const paymentLink = await tx.paymentLink.findUnique({
              where: { id: currentPayment.paymentLinkId },
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
                where: { id: currentPayment.paymentLinkId },
                data: {
                  currentPayments: newCurrentPayments,
                  status: newLinkStatus,
                  updatedAt: new Date(),
                },
              });

              console.log(`✅ Payment link ${paymentLink.id} updated: currentPayments=${paymentLink.currentPayments} -> ${newCurrentPayments}, status=${paymentLink.status} -> ${newLinkStatus}`);
            } else {
              console.log(`❌ Payment link ${currentPayment.paymentLinkId} not found`);
            }
          } catch (linkError) {
            console.error('❌ Failed to update payment link counter:', linkError);
            // Не прерываем транзакцию
          }
        } else {
          console.log(`📈 Payment ${paymentId} is not linked to a payment link`);
        }
      } else {
        console.log(`📈 Payment ${paymentId} status change does not trigger payment link counter update: ${oldStatus} -> ${newStatus.toUpperCase()}`);
      }
    });
  }

  // Обработка webhook от Plisio
  async processPlisioWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing Plisio webhook:', webhookData);

    try {
      const result = await this.plisioService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in Plisio webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for Plisio webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 Plisio webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус с дополнительными данными
      await this.updatePaymentStatus(payment.id, result.status, {
        txUrls: result.txUrls,
      });

      loggerService.logWebhookProcessed(
        'plisio',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing Plisio webhook:', error);
      loggerService.logWebhookError('plisio', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от Plisio Gateway
  async processPlisioGatewayWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing Plisio Gateway webhook:', webhookData);

    try {
      const result = await this.plisioService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in Plisio Gateway webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for Plisio Gateway webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 Plisio Gateway webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус с дополнительными данными
      await this.updatePaymentStatus(payment.id, result.status, {
        txUrls: result.txUrls,
      });

      loggerService.logWebhookProcessed(
        'plisio_gateway',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing Plisio Gateway webhook:', error);
      loggerService.logWebhookError('plisio_gateway', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от Rapyd
  async processRapydWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing Rapyd webhook:', webhookData);

    try {
      const result = await this.rapydService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in Rapyd webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for Rapyd webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 Rapyd webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус с дополнительными данными
      await this.updatePaymentStatus(payment.id, result.status, {
        failureMessage: result.failureMessage,
        cardLast4: result.additionalInfo?.cardLast4,
        paymentMethod: result.additionalInfo?.paymentMethod,
      });

      loggerService.logWebhookProcessed(
        'rapyd',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing Rapyd webhook:', error);
      loggerService.logWebhookError('rapyd', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от Noda
  async processNodaWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing Noda webhook:', webhookData);

    try {
      const result = await this.nodaService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in Noda webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for Noda webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 Noda webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус с дополнительными данными
      await this.updatePaymentStatus(payment.id, result.status, {
        bankId: result.additionalInfo?.bankId,
        remitterIban: result.additionalInfo?.remitterIban,
        remitterName: result.additionalInfo?.remitterName,
      });

      loggerService.logWebhookProcessed(
        'noda',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing Noda webhook:', error);
      loggerService.logWebhookError('noda', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от CoinToPay
  async processCoinToPayWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing CoinToPay webhook:', webhookData);

    try {
      const result = await this.coinToPayService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in CoinToPay webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for CoinToPay webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 CoinToPay webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус
      await this.updatePaymentStatus(payment.id, result.status);

      loggerService.logWebhookProcessed(
        'cointopay',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing CoinToPay webhook:', error);
      loggerService.logWebhookError('cointopay', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от CoinToPay2
  async processCoinToPay2Webhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing CoinToPay2 webhook:', webhookData);

    try {
      const result = await this.coinToPay2Service.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in CoinToPay2 webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for CoinToPay2 webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 CoinToPay2 webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус
      await this.updatePaymentStatus(payment.id, result.status);

      loggerService.logWebhookProcessed(
        'cointopay2',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing CoinToPay2 webhook:', error);
      loggerService.logWebhookError('cointopay2', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от KLYME
  async processKlymeWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing KLYME webhook:', webhookData);

    try {
      const result = await this.klymeService.processWebhook(webhookData);
      
      if (!result.paymentId) {
        throw new Error('No payment ID in KLYME webhook');
      }

      // Находим платеж по gatewayOrderId
      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: result.paymentId },
      });

      if (!payment) {
        console.error(`Payment not found for KLYME webhook: ${result.paymentId}`);
        return;
      }

      console.log(`📊 KLYME webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус с дополнительными данными
      await this.updatePaymentStatus(payment.id, result.status, {
        paymentMethod: result.additionalInfo?.payment_method,
      });

      loggerService.logWebhookProcessed(
        'klyme',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('Error processing KLYME webhook:', error);
      loggerService.logWebhookError('klyme', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от MasterCard
  async processMasterCardWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing MasterCard webhook:', JSON.stringify(webhookData, null, 2));

    try {
      const result = await this.masterCardService.processWebhook(webhookData);
      
      console.log(`📊 MasterCard webhook result:`, result);
      
      if (!result.paymentId) {
        console.error('❌ No payment ID extracted from MasterCard webhook data');
        console.error('❌ Available webhook fields:', Object.keys(webhookData));
        throw new Error('No payment ID in MasterCard webhook');
      }

      // ✅ ИСПРАВЛЕНО: Для MasterCard webhook ищем платеж по различным полям
      // MasterCard может возвращать payment_id (наш gatewayPaymentId) или order_id
      let payment = null;
      
      console.log(`🔍 MasterCard webhook: Searching for payment with ID: ${result.paymentId}`);
      
      // Сначала пытаемся найти по gatewayPaymentId (если в webhook пришел payment_id)
      if (result.paymentId) {
        console.log(`🔍 Trying to find MasterCard payment by various fields...`);
        
        payment = await prisma.payment.findFirst({
          where: {
            AND: [
              { gateway: 'mastercard' },
              {
                OR: [
                  { gatewayPaymentId: result.paymentId },
                  { gatewayOrderId: result.paymentId },
                  { id: result.paymentId },
                  { orderId: result.paymentId },
                ],
              },
            ],
          },
        });
        
        console.log(`🔍 Search result: ${payment ? `Found payment ${payment.id}` : 'Payment not found'}`);
      }

      if (!payment) {
        console.error(`❌ Payment not found for MasterCard webhook with ID: ${result.paymentId}`);
        console.error(`🔍 Searched by: gatewayOrderId="${result.paymentId}", id="${result.paymentId}", orderId="${result.paymentId}"`);
        
        // Попробуем найти все платежи с gateway = 'mastercard' для отладки
        const allMasterCardPayments = await prisma.payment.findMany({
          where: { gateway: 'mastercard' },
          select: { 
            id: true, 
            gatewayOrderId: true, 
            gatewayPaymentId: true, // ✅ ДОБАВЛЕНО: Включаем gatewayPaymentId для отладки
            orderId: true, 
            status: true 
          },
          take: 10,
        });
        console.log(`🔍 Available MasterCard payments for debugging:`, allMasterCardPayments);
        
        return;
      }

      console.log(`✅ Found payment ${payment.id} for MasterCard webhook, updating status from ${payment.status} to ${result.status}`);

      // ✅ НОВОЕ: Для MasterCard webhook не перезаписываем cardLast4, только обновляем статус
      // cardLast4 уже сохраняется при первоначальной обработке платежа в paymentController
      await this.updatePaymentStatus(payment.id, result.status);

      loggerService.logWebhookProcessed(
        'mastercard',
        payment.id,
        payment.status,
        result.status,
        webhookData
      );

    } catch (error) {
      console.error('❌ Error processing MasterCard webhook:', error);
      loggerService.logWebhookError('mastercard', error, webhookData);
      throw error;
    }
  }

  // Обработка webhook от Amer
  async processAmerWebhook(webhookData: any): Promise<void> {
    console.log('🔄 Processing Amer webhook:', JSON.stringify(webhookData, null, 2));

    try {
      const result = await this.amerService.processWebhook(webhookData);
      
      console.log(`📊 Amer webhook result:`, result);
      
      if (!result.paymentId) {
        console.error('❌ No payment ID extracted from Amer webhook data');
        console.error('❌ Available webhook fields:', Object.keys(webhookData));
        throw new Error('No payment ID in Amer webhook');
      }

      // Ищем платеж по различным полям для Amer
      let payment = null;
      
      console.log(`🔍 Amer webhook: Searching for payment with ID: ${result.paymentId}`);
      
      payment = await prisma.payment.findFirst({
        where: {
          AND: [
            { gateway: 'amer' },
            {
              OR: [
                { gatewayPaymentId: result.paymentId },
                { gatewayOrderId: result.paymentId },
                { id: result.paymentId },
                { orderId: result.paymentId },
              ],
            },
          ],
        },
      });
      
      console.log(`🔍 Search result: ${payment ? `Found payment ${payment.id}` : 'Payment not found'}`);

      if (!payment) {
        console.error(`❌ Payment not found for Amer webhook with ID: ${result.paymentId}`);
        return;
      }

      console.log(`📊 Amer webhook: Payment ${payment.id} status ${result.status}`);

      // Обновляем статус платежа
      await this.updatePaymentStatus(payment.id, result.status, {
        cardLast4: result.additionalInfo?.cardLast4,
        paymentMethod: result.additionalInfo?.paymentMethod
      });

    } catch (error) {
      console.error('❌ Error processing Amer webhook:', error);
      loggerService.logWebhookError('amer', error, webhookData);
      throw error;
    }
  }

  // Отправка webhook мерчанту
  private async sendShopWebhook(payment: any, status: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const shop = payment.shop;
      const settings = shop.settings;

      if (!settings?.webhookUrl) {
        console.log(`No webhook URL configured for shop ${shop.id}`);
        return;
      }

      // Определяем тип события
      const eventName = status === 'PAID' ? 'payment.success' : 
                       status === 'FAILED' ? 'payment.failed' : 
                       status === 'EXPIRED' ? 'payment.failed' : 
                       status === 'CHARGEBACK' ? 'payment.failed' :
                       status === 'REFUND' ? 'payment.failed' :
                       'payment.pending';

      // Проверяем, включен ли этот тип события
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

      // Подготавливаем payload для webhook
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
          failure_message: payment.failureMessage,
          tx_urls: payment.txUrls ? JSON.parse(payment.txUrls) : null,
          created_at: payment.createdAt,
          updated_at: payment.updatedAt,
        },
      };

      // Отправляем webhook
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

      // Логируем отправку webhook
      loggerService.logShopWebhookSent(
        payment.shopId,
        settings.webhookUrl,
        eventName,
        response.status,
        responseTime,
        webhookPayload
      );

      console.log(`📤 Shop webhook sent to ${settings.webhookUrl} with status ${response.status} (${responseTime}ms)`);

    } catch (error) {
      console.error('Failed to send shop webhook:', error);
      
      // Логируем ошибку webhook
      loggerService.logShopWebhookError(
        payment.shopId,
        payment.shop?.settings?.webhookUrl || 'unknown',
        'webhook_send',
        error,
        {}
      );
    }
  }

  // Отправка Telegram уведомления
  private async sendPaymentStatusNotification(payment: any, status: string): Promise<void> {
    try {
      const statusMap: Record<string, 'created' | 'paid' | 'failed' | 'expired' | 'refund' | 'chargeback' | 'processing'> = {
        'PENDING': 'created',
        'PROCESSING': 'processing',
        'PAID': 'paid',
        'FAILED': 'failed',
        'EXPIRED': 'expired',
        'REFUND': 'refund',
        'CHARGEBACK': 'chargeback',
      };

      const telegramStatus = statusMap[status];
      if (!telegramStatus || telegramStatus === 'created') return;

      await telegramBotService.sendPaymentNotification(payment.shopId, payment, telegramStatus);
    } catch (error) {
      console.error('Failed to send Telegram payment notification:', error);
    }
  }

  // Получение комиссии шлюза для конкретного магазина
  private async getGatewayCommission(shopId: string, gatewayName: string): Promise<number> {
    try {
      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: { gatewaySettings: true },
      });

      if (!shop?.gatewaySettings) {
        console.log(`No gateway settings found for shop ${shopId}, using default commission 10%`);
        return 10; // По умолчанию 10%
      }

      const gatewaySettings = JSON.parse(shop.gatewaySettings);
      
      // Ищем настройки шлюза без учета регистра
      for (const [key, value] of Object.entries(gatewaySettings)) {
        if (key.toLowerCase() === gatewayName.toLowerCase()) {
          const commission = (value as any).commission || 10;
          console.log(`Gateway ${gatewayName} commission for shop ${shopId}: ${commission}%`);
          return commission;
        }
      }

      console.log(`No specific commission found for gateway ${gatewayName} in shop ${shopId}, using default 10%`);
      return 10; // По умолчанию 10%
    } catch (error) {
      console.error(`Error getting gateway commission for shop ${shopId}, gateway ${gatewayName}:`, error);
      return 10; // По умолчанию 10%
    }
  }
}