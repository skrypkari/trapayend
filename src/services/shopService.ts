import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { 
  ShopProfileResponse, 
  UpdateShopProfileRequest, 
  UpdateWalletsRequest 
} from '../types/shop';
import { 
  CreatePaymentRequest, 
  UpdatePaymentRequest, 
  PaymentResponse, 
  PaymentFilters 
} from '../types/payment';
import { 
  PayoutResponse, 
  PayoutFilters, 
  PayoutStatistics, 
  ShopPayoutStats,
  PayoutStats,
  ShopPayoutResponse 
} from '../types/payout';
import { WebhookLogResponse, WebhookLogFilters } from '../types/webhook';
import { PlisioService } from './gateways/plisioService';
import { RapydService } from './gateways/rapydService';
import { NodaService } from './gateways/nodaService';
import { CoinToPayService } from './gateways/coinToPayService';
import { KlymeService } from './gateways/klymeService';
import { telegramBotService } from './telegramBotService';
import { coinToPayStatusService } from './coinToPayStatusService';
import { getGatewayNameById, getGatewayIdByName, isValidGatewayId, getKlymeRegionFromGatewayName } from '../types/gateway';
import { currencyService } from './currencyService';

export class ShopService {
  private plisioService: PlisioService;
  private rapydService: RapydService;
  private nodaService: NodaService;
  private coinToPayService: CoinToPayService;
  private klymeService: KlymeService;

  constructor() {
    this.plisioService = new PlisioService();
    this.rapydService = new RapydService();
    this.nodaService = new NodaService();
    this.coinToPayService = new CoinToPayService();
    this.klymeService = new KlymeService();
  }

  private async generateGatewayOrderId(): Promise<string> {
    let gatewayOrderId: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      const generateSegment = () => {
        return Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
      };
      
      gatewayOrderId = `${generateSegment()}-${generateSegment()}`;
      
      const existingPayment = await prisma.payment.findFirst({
        where: { gatewayOrderId },
      });

      if (!existingPayment) {
        break;
      }

      attempts++;
      console.log(`⚠️ Gateway order ID ${gatewayOrderId} already exists, generating new one (attempt ${attempts})`);
      
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique gateway order ID after maximum attempts');
    }

    return gatewayOrderId;
  }

  // ✅ ОБНОВЛЕНО: Унифицированная генерация URL - везде app.trapay.uk + whiteUrl
  private generateGatewayUrls(
    gatewayName: string, 
    paymentId: string, 
    gatewayOrderId: string,
    baseUrl: string, 
    successUrl?: string, 
    failUrl?: string,
    pendingUrl?: string
  ): {
    finalSuccessUrl: string;
    finalFailUrl: string;
    finalPendingUrl: string;
    dbSuccessUrl: string;
    dbFailUrl: string;
    dbPendingUrl: string;
    whiteUrl: string | null; // ✅ НОВОЕ: Поле для whiteUrl
  } {
    if (successUrl && failUrl && pendingUrl) {
      return {
        finalSuccessUrl: successUrl,
        finalFailUrl: failUrl,
        finalPendingUrl: pendingUrl,
        dbSuccessUrl: successUrl,
        dbFailUrl: failUrl,
        dbPendingUrl: pendingUrl,
        whiteUrl: null, // ✅ НОВОЕ: Если мерчант передал свои URL, whiteUrl не нужен
      };
    }

    // ✅ ОБНОВЛЕНО: Везде используем app.trapay.uk с payment_id параметром
    const dbSuccessUrl = successUrl || `https://app.trapay.uk/payment/success?id=${paymentId}&payment_id=${gatewayOrderId}`;
    const dbFailUrl = failUrl || `https://app.trapay.uk/payment/fail?id=${paymentId}&payment_id=${gatewayOrderId}`;
    const dbPendingUrl = pendingUrl || `https://app.trapay.uk/payment/pending?id=${paymentId}&payment_id=${gatewayOrderId}`;

    let finalSuccessUrl: string;
    let finalFailUrl: string;
    let finalPendingUrl: string;

    // Для KLYME, CoinToPay и Noda используем pending URL как success URL
    if (gatewayName === 'noda' || gatewayName.startsWith('klyme_') || gatewayName === 'cointopay') {
      finalSuccessUrl = `${baseUrl}/gateway/pending.php?id=${paymentId}`;
      finalPendingUrl = `${baseUrl}/gateway/pending.php?id=${paymentId}`;
    } else {
      finalSuccessUrl = `${baseUrl}/gateway/success.php?id=${paymentId}`;
      finalPendingUrl = `${baseUrl}/gateway/pending.php?id=${paymentId}`;
    }

    finalFailUrl = `${baseUrl}/gateway/fail.php?id=${paymentId}`;

    // ✅ НОВОЕ: Генерируем whiteUrl для всех шлюзов кроме Plisio и KLYME
    let whiteUrl: string | null = null;
    if (gatewayName !== 'plisio' && !gatewayName.startsWith('klyme_')) {
      whiteUrl = `https://tesoft.uk/gateway/payment.php?id=${paymentId}`;
      console.log(`🔗 Generated whiteUrl for ${gatewayName}: ${whiteUrl}`);
    } else {
      console.log(`🔗 No whiteUrl for ${gatewayName} (Plisio or KLYME)`);
    }

    console.log(`🔗 Generated URLs for ${gatewayName} with payment ID ${paymentId}:`);
    console.log(`   🌐 Gateway Success URL: ${finalSuccessUrl}`);
    console.log(`   🌐 Gateway Fail URL: ${finalFailUrl}`);
    console.log(`   🌐 Gateway Pending URL: ${finalPendingUrl}`);
    console.log(`   💾 DB Success URL: ${dbSuccessUrl}`);
    console.log(`   💾 DB Fail URL: ${dbFailUrl}`);
    console.log(`   💾 DB Pending URL: ${dbPendingUrl}`);
    console.log(`   🔗 White URL: ${whiteUrl || 'none'}`);

    return { 
      finalSuccessUrl, 
      finalFailUrl, 
      finalPendingUrl,
      dbSuccessUrl, 
      dbFailUrl, 
      dbPendingUrl,
      whiteUrl, // ✅ НОВОЕ: Возвращаем whiteUrl
    };
  }

  private validateKlymeCurrency(gatewayName: string, currency: string): void {
    if (!gatewayName.startsWith('klyme_')) return;

    const region = getKlymeRegionFromGatewayName(gatewayName);
    const upperCurrency = currency.toUpperCase();

    switch (region) {
      case 'EU':
        if (upperCurrency !== 'EUR') {
          throw new Error(`KLYME EU accepts only EUR currency, got: ${upperCurrency}`);
        }
        break;
      case 'GB':
        if (upperCurrency !== 'GBP') {
          throw new Error(`KLYME GB accepts only GBP currency, got: ${upperCurrency}`);
        }
        break;
      case 'DE':
        if (upperCurrency !== 'EUR') {
          throw new Error(`KLYME DE accepts only EUR currency, got: ${upperCurrency}`);
        }
        break;
      default:
        throw new Error(`Unsupported KLYME region: ${region}`);
    }
  }

  // ✅ НОВОЕ: Проверка минимальной суммы платежа
  private async checkMinimumAmount(shopId: string, gatewayName: string, amount: number): Promise<void> {
    console.log(`💰 Checking minimum amount for shop ${shopId}, gateway ${gatewayName}, amount: ${amount}`);

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        username: true,
        gatewaySettings: true,
      },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    // Получаем настройки шлюзов
    let gatewaySettings: Record<string, any> = {};
    
    if (shop.gatewaySettings) {
      try {
        gatewaySettings = JSON.parse(shop.gatewaySettings);
        console.log(`💰 Shop ${shop.username} gateway settings:`, gatewaySettings);
      } catch (error) {
        console.error('Error parsing gateway settings:', error);
        gatewaySettings = {};
      }
    }

    // Получаем displayName шлюза
    const gatewayDisplayName = this.getGatewayDisplayName(gatewayName);
    console.log(`💰 Checking settings for gateway: ${gatewayName} -> ${gatewayDisplayName}`);

    // Проверяем настройки для данного шлюза
    const settings = gatewaySettings[gatewayDisplayName];
    if (settings && settings.minAmount !== undefined) {
      const minAmount = settings.minAmount;
      console.log(`💰 Gateway ${gatewayDisplayName} minimum amount: ${minAmount}`);
      
      if (amount < minAmount) {
        console.error(`❌ Amount ${amount} is below minimum ${minAmount} for gateway ${gatewayDisplayName}`);
        throw new Error(
          `Payment amount ${amount} is below the minimum required amount of ${minAmount} for ${gatewayDisplayName} gateway. ` +
          `Please increase the amount to at least ${minAmount}.`
        );
      }
      
      console.log(`✅ Amount ${amount} meets minimum requirement of ${minAmount} for gateway ${gatewayDisplayName}`);
    } else {
      console.log(`💰 No minimum amount set for gateway ${gatewayDisplayName}`);
    }
  }

  private async checkGatewayPermission(shopId: string, gatewayName: string): Promise<void> {
    console.log(`🔐 Checking gateway permission for shop ${shopId}: ${gatewayName}`);

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        username: true,
        paymentGateways: true,
      },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    let enabledGateways: string[] = [];
    
    if (shop.paymentGateways) {
      try {
        enabledGateways = JSON.parse(shop.paymentGateways);
        console.log(`🔐 Shop ${shop.username} enabled gateways:`, enabledGateways);
      } catch (error) {
        console.error('Error parsing payment gateways:', error);
        enabledGateways = ['Plisio'];
      }
    } else {
      enabledGateways = ['Plisio'];
      console.log(`🔐 Shop ${shop.username} using default gateways:`, enabledGateways);
    }

    const gatewayDisplayName = this.getGatewayDisplayName(gatewayName);
    
    console.log(`🔐 Checking if "${gatewayDisplayName}" is in enabled gateways:`, enabledGateways);

    if (!enabledGateways.includes(gatewayDisplayName)) {
      console.error(`❌ Gateway "${gatewayDisplayName}" not allowed for shop ${shop.username}`);
      console.error(`❌ Enabled gateways: ${enabledGateways.join(', ')}`);
      
      throw new Error(
        `Gateway "${gatewayDisplayName}" is not enabled for your shop. ` +
        `Enabled gateways: ${enabledGateways.join(', ')}. ` +
        `Please contact support to enable additional gateways.`
      );
    }

    console.log(`✅ Gateway "${gatewayDisplayName}" is allowed for shop ${shop.username}`);
  }

  private getGatewayDisplayName(gatewayName: string): string {
    const gatewayDisplayNames: Record<string, string> = {
      'plisio': 'Plisio',
      'rapyd': 'Rapyd',
      'noda': 'Noda',
      'cointopay': 'CoinToPay',
      'klyme_eu': 'KLYME EU',
      'klyme_gb': 'KLYME GB',
      'klyme_de': 'KLYME DE',
    };

    return gatewayDisplayNames[gatewayName] || gatewayName;
  }

  // Shop profile management
  async getShopProfile(shopId: string): Promise<ShopProfileResponse> {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        username: true,
        telegram: true,
        shopUrl: true,
        paymentGateways: true,
        gatewaySettings: true,
        publicKey: true,
        usdtPolygonWallet: true,
        usdtTrcWallet: true,
        usdtErcWallet: true,
        usdcPolygonWallet: true,
        status: true,
        createdAt: true,
        settings: {
          select: {
            webhookUrl: true,
            webhookEvents: true,
          },
        },
      },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    // Parse webhook events (handle JSON for MySQL)
    let webhookEvents: string[] = [];
    if (shop.settings?.webhookEvents) {
      try {
        webhookEvents = Array.isArray(shop.settings.webhookEvents) 
          ? shop.settings.webhookEvents 
          : JSON.parse(shop.settings.webhookEvents as string);
      } catch (error) {
        console.error('Error parsing webhook events:', error);
        webhookEvents = [];
      }
    }

    return {
      id: shop.id,
      fullName: shop.name,
      username: shop.username,
      telegramId: shop.telegram,
      merchantUrl: shop.shopUrl,
      gateways: shop.paymentGateways ? JSON.parse(shop.paymentGateways) : null,
      gatewaySettings: shop.gatewaySettings ? JSON.parse(shop.gatewaySettings) : null,
      publicKey: shop.publicKey,
      webhookUrl: shop.settings?.webhookUrl,
      webhookEvents: webhookEvents,
      wallets: {
        usdtPolygonWallet: shop.usdtPolygonWallet,
        usdtTrcWallet: shop.usdtTrcWallet,
        usdtErcWallet: shop.usdtErcWallet,
        usdcPolygonWallet: shop.usdcPolygonWallet,
      },
      status: shop.status,
      createdAt: shop.createdAt,
    };
  }

  async updateShopProfile(shopId: string, updateData: UpdateShopProfileRequest): Promise<ShopProfileResponse> {
    const updatePayload: any = {};

    if (updateData.fullName) {
      updatePayload.name = updateData.fullName;
    }

    if (updateData.telegramId !== undefined) {
      updatePayload.telegram = updateData.telegramId || null;
    }

    if (updateData.merchantUrl) {
      updatePayload.shopUrl = updateData.merchantUrl;
    }

    if (updateData.gateways) {
      updatePayload.paymentGateways = JSON.stringify(updateData.gateways);
    }

    if (updateData.gatewaySettings) {
      updatePayload.gatewaySettings = JSON.stringify(updateData.gatewaySettings);
    }

    // Handle wallet fields
    if (updateData.wallets) {
      if (updateData.wallets.usdtPolygonWallet !== undefined) {
        updatePayload.usdtPolygonWallet = updateData.wallets.usdtPolygonWallet || null;
      }
      if (updateData.wallets.usdtTrcWallet !== undefined) {
        updatePayload.usdtTrcWallet = updateData.wallets.usdtTrcWallet || null;
      }
      if (updateData.wallets.usdtErcWallet !== undefined) {
        updatePayload.usdtErcWallet = updateData.wallets.usdtErcWallet || null;
      }
      if (updateData.wallets.usdcPolygonWallet !== undefined) {
        updatePayload.usdcPolygonWallet = updateData.wallets.usdcPolygonWallet || null;
      }
    }

    const updatedShop = await prisma.shop.update({
      where: { id: shopId },
      data: updatePayload,
      select: {
        id: true,
        name: true,
        username: true,
        telegram: true,
        shopUrl: true,
        paymentGateways: true,
        gatewaySettings: true,
        publicKey: true,
        usdtPolygonWallet: true,
        usdtTrcWallet: true,
        usdtErcWallet: true,
        usdcPolygonWallet: true,
        status: true,
        createdAt: true,
        settings: {
          select: {
            webhookUrl: true,
            webhookEvents: true,
          },
        },
      },
    });

    // Parse webhook events (handle JSON for MySQL)
    let webhookEvents: string[] = [];
    if (updatedShop.settings?.webhookEvents) {
      try {
        webhookEvents = Array.isArray(updatedShop.settings.webhookEvents) 
          ? updatedShop.settings.webhookEvents 
          : JSON.parse(updatedShop.settings.webhookEvents as string);
      } catch (error) {
        console.error('Error parsing webhook events:', error);
        webhookEvents = [];
      }
    }

    return {
      id: updatedShop.id,
      fullName: updatedShop.name,
      username: updatedShop.username,
      telegramId: updatedShop.telegram,
      merchantUrl: updatedShop.shopUrl,
      gateways: updatedShop.paymentGateways ? JSON.parse(updatedShop.paymentGateways) : null,
      gatewaySettings: updatedShop.gatewaySettings ? JSON.parse(updatedShop.gatewaySettings) : null,
      publicKey: updatedShop.publicKey,
      webhookUrl: updatedShop.settings?.webhookUrl,
      webhookEvents: webhookEvents,
      wallets: {
        usdtPolygonWallet: updatedShop.usdtPolygonWallet,
        usdtTrcWallet: updatedShop.usdtTrcWallet,
        usdtErcWallet: updatedShop.usdtErcWallet,
        usdcPolygonWallet: updatedShop.usdcPolygonWallet,
      },
      status: updatedShop.status,
      createdAt: updatedShop.createdAt,
    };
  }

  async updateWallets(shopId: string, walletData: UpdateWalletsRequest): Promise<void> {
    const updateData: any = {};

    if (walletData.usdtPolygonWallet !== undefined) {
      updateData.usdtPolygonWallet = walletData.usdtPolygonWallet || null;
    }
    if (walletData.usdtTrcWallet !== undefined) {
      updateData.usdtTrcWallet = walletData.usdtTrcWallet || null;
    }
    if (walletData.usdtErcWallet !== undefined) {
      updateData.usdtErcWallet = walletData.usdtErcWallet || null;
    }
    if (walletData.usdcPolygonWallet !== undefined) {
      updateData.usdcPolygonWallet = walletData.usdcPolygonWallet || null;
    }

    await prisma.shop.update({
      where: { id: shopId },
      data: updateData,
    });
  }

  async testWebhook(shopId: string): Promise<{ success: boolean; message: string }> {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        settings: {
          select: {
            webhookUrl: true,
            webhookEvents: true,
          },
        },
      },
    });

    if (!shop || !shop.settings?.webhookUrl) {
      throw new Error('No webhook URL configured');
    }

    const testPayload = {
      event: 'test',
      payment: {
        id: 'test_payment_123',
        order_id: 'test_order_456',
        gateway_order_id: '12345678-87654321',
        gateway: 'test',
        amount: 100,
        currency: 'USD',
        status: 'paid',
        customer_email: 'test@example.com',
        customer_name: 'Test Customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    try {
      const response = await fetch(shop.settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0',
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        return {
          success: true,
          message: `Test webhook sent successfully (${response.status})`,
        };
      } else {
        return {
          success: false,
          message: `Webhook returned error: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to send webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Payment management
  async createPayment(paymentData: CreatePaymentRequest): Promise<PaymentResponse> {
    const {
      shopId,
      gateway: gatewayId,
      amount,
      currency,
      sourceCurrency,
      usage,
      expiresAt,
      redirectUrl,
      customerEmail,
      customerName,
      country,
      language,
      amountIsEditable,
      maxPayments,
      customer,
    } = paymentData;

    if (!isValidGatewayId(gatewayId)) {
      throw new Error(`Invalid gateway ID: ${gatewayId}. Valid IDs are: 0001 (Plisio), 0010 (Rapyd), 0100 (CoinToPay), 1000 (Noda), 1001 (KLYME EU), 1010 (KLYME GB), 1100 (KLYME DE)`);
    }

    const gatewayName = getGatewayNameById(gatewayId);
    if (!gatewayName) {
      throw new Error(`Gateway not found for ID: ${gatewayId}`);
    }

    console.log(`🔄 Creating payment for gateway ID ${gatewayId} (${gatewayName})`);

    await this.checkGatewayPermission(shopId, gatewayName);

    // ✅ НОВОЕ: Проверяем минимальную сумму платежа
    await this.checkMinimumAmount(shopId, gatewayName, amount);

    this.validateKlymeCurrency(gatewayName, currency || 'USD');

    const gatewayOrderId = await this.generateGatewayOrderId();
    console.log(`🎯 Generated unique gateway order_id: ${gatewayOrderId} (8digits-8digits format for ${gatewayName})`);

    const payment = await prisma.payment.create({
      data: {
        shopId,
        gateway: gatewayName,
        amount,
        currency: currency || 'USD',
        sourceCurrency: sourceCurrency || null,
        usage: usage || 'ONCE',
        expiresAt: expiresAt || null,
        successUrl: 'temp',
        failUrl: 'temp',
        pendingUrl: 'temp',
        whiteUrl: 'temp', // ✅ НОВОЕ: Временное значение для whiteUrl
        status: 'PENDING',
        orderId: null,
        gatewayOrderId: gatewayOrderId,
        customerEmail: customerEmail || null,
        customerName: customerName || null,
        country: country || null,
        language: language || null,
        amountIsEditable: amountIsEditable || null,
        maxPayments: maxPayments || null,
        rapydCustomer: customer || null,
      },
    });

    console.log(`💾 Payment created in database:`);
    console.log(`   - Internal ID: ${payment.id}`);
    console.log(`   - Gateway order_id: ${gatewayOrderId} (8digits-8digits)`);

    const baseUrl = process.env.BASE_URL || 'https://tesoft.uk';
    const { 
      finalSuccessUrl, 
      finalFailUrl, 
      finalPendingUrl,
      dbSuccessUrl, 
      dbFailUrl, 
      dbPendingUrl,
      whiteUrl, // ✅ НОВОЕ: Получаем whiteUrl
    } = this.generateGatewayUrls(
      gatewayName, 
      payment.id, 
      gatewayOrderId,
      baseUrl, 
      undefined, 
      undefined,
      undefined
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        successUrl: dbSuccessUrl,
        failUrl: dbFailUrl,
        pendingUrl: dbPendingUrl,
        whiteUrl: whiteUrl, // ✅ НОВОЕ: Сохраняем whiteUrl
      },
    });

    console.log(`   - DB Success URL: ${dbSuccessUrl}`);
    console.log(`   - DB Fail URL: ${dbFailUrl}`);
    console.log(`   - DB Pending URL: ${dbPendingUrl}`);
    console.log(`   - White URL: ${whiteUrl || 'none'}`); // ✅ НОВОЕ: Логируем whiteUrl

    let gatewayPaymentId: string | undefined;
    let externalPaymentUrl: string | undefined;

    try {
      if (gatewayName === 'plisio') {
        const plisioResult = await this.plisioService.createPayment({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          amount,
          currency: currency || 'USD',
          productName: `Order ID: ${gatewayOrderId}`,
          description: `Order ID: ${gatewayOrderId}`,
          successUrl: finalSuccessUrl,
          failUrl: finalFailUrl,
          customerEmail,
          customerName,
          isSourceCurrency: !!sourceCurrency,
          sourceCurrency,
        });

        gatewayPaymentId = plisioResult.gateway_payment_id;
        externalPaymentUrl = plisioResult.payment_url;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: externalPaymentUrl,
            gatewayPaymentId: gatewayPaymentId,
            invoiceTotalSum: Number(plisioResult.invoice_total_sum),
            qrCode: plisioResult.qr_code,
            qrUrl: plisioResult.qr_url,
          },
        });

      } else if (gatewayName === 'rapyd') {
        const rapydCountry = 'GB';
        console.log(`🇬🇧 Using GB (Britain) as country for Rapyd payment`);

        const rapydResult = await this.rapydService.createPaymentLink({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          orderName: `Order ID: ${gatewayOrderId}`,
          amount,
          currency: currency || 'USD',
          country: rapydCountry,
          language: language || 'EN',
          amountIsEditable: amountIsEditable || false,
          usage: usage || 'ONCE',
          maxPayments,
          customer,
          successUrl: finalSuccessUrl,
          failUrl: finalFailUrl,
        });

        gatewayPaymentId = rapydResult.gateway_payment_id;
        externalPaymentUrl = rapydResult.payment_url;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: externalPaymentUrl,
            gatewayPaymentId: gatewayPaymentId,
            country: rapydCountry,
          },
        });

      } else if (gatewayName === 'noda') {
        console.log(`🔄 Creating Noda payment with gateway order_id: ${gatewayOrderId} (8digits-8digits format)`);

        const nodaResult = await this.nodaService.createPaymentLink({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          name: `Order ID: ${gatewayOrderId}`,
          paymentDescription: `Order ID: ${gatewayOrderId}`,
          amount,
          currency: currency || 'USD',
          webhookUrl: `https://tesoft.uk/gateways/noda/webhook`,
          returnUrl: finalPendingUrl,
          expiryDate: expiresAt?.toISOString(),
        });

        gatewayPaymentId = nodaResult.gateway_payment_id;
        externalPaymentUrl = nodaResult.payment_url;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: externalPaymentUrl,
            gatewayPaymentId: gatewayPaymentId,
            qrUrl: nodaResult.qr_code_url,
          },
        });

      } else if (gatewayName === 'cointopay') {
        console.log(`🪙 Creating CoinToPay payment with gateway order_id: ${gatewayOrderId} (8digits-8digits format)`);
        console.log(`💰 Amount: ${amount} EUR (always EUR for CoinToPay)`);

        const coinToPayResult = await this.coinToPayService.createPaymentLink({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          amount,
        });

        gatewayPaymentId = coinToPayResult.gateway_payment_id;
        externalPaymentUrl = coinToPayResult.payment_url;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: externalPaymentUrl,
            gatewayPaymentId: gatewayPaymentId,
            currency: 'EUR',
          },
        });

        if (gatewayPaymentId) {
          console.log(`🪙 Scheduling individual status checks for CoinToPay payment: ${payment.id} (${gatewayPaymentId})`);
          coinToPayStatusService.schedulePaymentChecks(payment.id, gatewayPaymentId);
        }

      } else if (gatewayName.startsWith('klyme_')) {
        const region = getKlymeRegionFromGatewayName(gatewayName);
        
        if (!region) {
          throw new Error(`Invalid KLYME gateway: ${gatewayName}`);
        }

        console.log(`💳 Creating KLYME ${region} payment with gateway order_id: ${gatewayOrderId} (8digits-8digits format)`);
        console.log(`💰 Amount: ${amount} ${currency || 'USD'} (validated for ${region})`);

        const klymeResult = await this.klymeService.createPaymentLink({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          amount,
          currency: currency || 'USD',
          region,
          redirectUrl: finalPendingUrl,
        });

        gatewayPaymentId = klymeResult.gateway_payment_id;
        externalPaymentUrl = klymeResult.payment_url;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: externalPaymentUrl,
            gatewayPaymentId: gatewayPaymentId,
          },
        });

      } else {
        throw new Error(`Unsupported gateway: ${gatewayName}`);
      }

    } catch (gatewayError) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      
      throw new Error(`Gateway error: ${gatewayError instanceof Error ? gatewayError.message : 'Unknown error'}`);
    }

    // ✅ ОБНОВЛЕНО: Везде возвращаем app.trapay.uk
    const paymentUrl = `https://app.trapay.uk/payment/${payment.id}`;

    return {
      id: payment.id,
      shopId: payment.shopId,
      gateway: gatewayId, // Return gateway ID instead of name
      amount: payment.amount,
      currency: payment.currency,
      sourceCurrency: payment.sourceCurrency,
      usage: payment.usage,
      expiresAt: payment.expiresAt,
      redirectUrl: paymentUrl, // ✅ Always tesoft.uk URL for merchants
      status: payment.status,
      externalPaymentUrl: externalPaymentUrl, // Original gateway URL (for internal use)
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      country: payment.country,
      language: payment.language,
      amountIsEditable: payment.amountIsEditable,
      maxPayments: payment.maxPayments,
      customer: payment.rapydCustomer,
      whiteUrl: whiteUrl, // ✅ НОВОЕ: Возвращаем whiteUrl
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  async getPayments(shopId: string, filters: PaymentFilters): Promise<{
    payments: PaymentResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, status, gateway } = filters;
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    if (gateway) {
      if (isValidGatewayId(gateway)) {
        const gatewayName = getGatewayNameById(gateway);
        if (gatewayName) {
          where.gateway = gatewayName;
        }
      } else {
        where.gateway = gateway.toLowerCase();
      }
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          shopId: true,
          gateway: true,
          amount: true,
          currency: true,
          sourceCurrency: true,
          usage: true,
          expiresAt: true,
          successUrl: true,
          status: true,
          externalPaymentUrl: true,
          customerEmail: true,
          customerName: true,
          country: true,
          language: true,
          amountIsEditable: true,
          maxPayments: true,
          rapydCustomer: true,
          whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
          createdAt: true,
          updatedAt: true,
          shop: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map(payment => {
        // ✅ ОБНОВЛЕНО: Везде возвращаем app.trapay.uk
        const paymentUrl = `https://app.trapay.uk/payment/${payment.id}`;
        const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

        return {
          id: payment.id,
          shopId: payment.shopId,
          gateway: gatewayId, // Return gateway ID instead of name
          amount: payment.amount,
          currency: payment.currency,
          sourceCurrency: payment.sourceCurrency,
          usage: payment.usage,
          expiresAt: payment.expiresAt,
          redirectUrl: paymentUrl, // ✅ Always tesoft.uk URL for merchants
          status: payment.status,
          externalPaymentUrl: payment.externalPaymentUrl, // Original gateway URL (for internal use)
          customerEmail: payment.customerEmail,
          customerName: payment.customerName,
          country: payment.country,
          language: payment.language,
          amountIsEditable: payment.amountIsEditable,
          maxPayments: payment.maxPayments,
          customer: payment.rapydCustomer,
          whiteUrl: payment.whiteUrl, // ✅ НОВОЕ: Возвращаем whiteUrl
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          shop: payment.shop,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPaymentById(shopId: string, paymentId: string): Promise<PaymentResponse | null> {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        shopId,
      },
      select: {
        id: true,
        shopId: true,
        gateway: true,
        amount: true,
        currency: true,
        sourceCurrency: true,
        usage: true,
        expiresAt: true,
        successUrl: true,
        status: true,
        externalPaymentUrl: true,
        customerEmail: true,
        customerName: true,
        country: true,
        language: true,
        amountIsEditable: true,
        maxPayments: true,
        rapydCustomer: true,
        whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
        createdAt: true,
        updatedAt: true,
        shop: {
          select: {
            name: true,
            username: true,
          },
        },
        webhookLogs: {
          select: {
            id: true,
            event: true,
            statusCode: true,
            retryCount: true,
            responseBody: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!payment) return null;

    // ✅ ОБНОВЛЕНО: Везде возвращаем app.trapay.uk
    const paymentUrl = `https://app.trapay.uk/payment/${payment.id}`;
    const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

    return {
      id: payment.id,
      shopId: payment.shopId,
      gateway: gatewayId, // Return gateway ID instead of name
      amount: payment.amount,
      currency: payment.currency,
      sourceCurrency: payment.sourceCurrency,
      usage: payment.usage,
      expiresAt: payment.expiresAt,
      redirectUrl: paymentUrl, // ✅ Always tesoft.uk URL for merchants
      status: payment.status,
      externalPaymentUrl: payment.externalPaymentUrl, // Original gateway URL (for internal use)
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      country: payment.country,
      language: payment.language,
      amountIsEditable: payment.amountIsEditable,
      maxPayments: payment.maxPayments,
      customer: payment.rapydCustomer,
      whiteUrl: payment.whiteUrl, // ✅ НОВОЕ: Возвращаем whiteUrl
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      shop: payment.shop,
      webhookLogs: payment.webhookLogs,
    };
  }

  async updatePayment(shopId: string, paymentId: string, updateData: UpdatePaymentRequest): Promise<PaymentResponse> {
    const updatePayload: any = { ...updateData };

    if (updateData.gateway) {
      if (isValidGatewayId(updateData.gateway)) {
        const gatewayName = getGatewayNameById(updateData.gateway);
        if (gatewayName) {
          await this.checkGatewayPermission(shopId, gatewayName);
          updatePayload.gateway = gatewayName;
        }
      } else {
        updatePayload.gateway = updateData.gateway.toLowerCase();
      }
    }

    if (updatePayload.gateway && updateData.currency) {
      this.validateKlymeCurrency(updatePayload.gateway, updateData.currency);
    }

    // ✅ НОВОЕ: Проверяем минимальную сумму при обновлении
    if (updateData.amount && updatePayload.gateway) {
      await this.checkMinimumAmount(shopId, updatePayload.gateway, updateData.amount);
    }

    const updatedPayment = await prisma.payment.update({
      where: {
        id: paymentId,
        shopId,
      },
      data: updatePayload,
      select: {
        id: true,
        shopId: true,
        gateway: true,
        amount: true,
        currency: true,
        sourceCurrency: true,
        usage: true,
        expiresAt: true,
        successUrl: true,
        status: true,
        externalPaymentUrl: true,
        customerEmail: true,
        customerName: true,
        country: true,
        language: true,
        amountIsEditable: true,
        maxPayments: true,
        rapydCustomer: true,
        whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
        createdAt: true,
        updatedAt: true,
        shop: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    });

    // ✅ ОБНОВЛЕНО: Везде возвращаем app.trapay.uk
    const paymentUrl = `https://app.trapay.uk/payment/${updatedPayment.id}`;
    const gatewayId = getGatewayIdByName(updatedPayment.gateway) || updatedPayment.gateway;

    return {
      id: updatedPayment.id,
      shopId: updatedPayment.shopId,
      gateway: gatewayId, // Return gateway ID instead of name
      amount: updatedPayment.amount,
      currency: updatedPayment.currency,
      sourceCurrency: updatedPayment.sourceCurrency,
      usage: updatedPayment.usage,
      expiresAt: updatedPayment.expiresAt,
      redirectUrl: paymentUrl, // ✅ Always tesoft.uk URL for merchants
      status: updatedPayment.status,
      externalPaymentUrl: updatedPayment.externalPaymentUrl, // Original gateway URL (for internal use)
      customerEmail: updatedPayment.customerEmail,
      customerName: updatedPayment.customerName,
      country: updatedPayment.country,
      language: updatedPayment.language,
      amountIsEditable: updatedPayment.amountIsEditable,
      maxPayments: updatedPayment.maxPayments,
      customer: updatedPayment.rapydCustomer,
      whiteUrl: updatedPayment.whiteUrl, // ✅ НОВОЕ: Возвращаем whiteUrl
      createdAt: updatedPayment.createdAt,
      updatedAt: updatedPayment.updatedAt,
      shop: updatedPayment.shop,
    };
  }

  async deletePayment(shopId: string, paymentId: string): Promise<void> {
    await prisma.payment.delete({
      where: {
        id: paymentId,
        shopId,
      },
    });
  }

  // ✅ ИСПРАВЛЕНО: Новый метод для расчета статистики выплат на основе платежей
  private async calculateShopPayoutStatsFromPayments(shopId: string): Promise<ShopPayoutStats> {
    console.log(`📊 Calculating shop payout stats from payments for shop: ${shopId}`);

    // Получаем все оплаченные платежи магазина
    const paidPayments = await prisma.payment.findMany({
      where: {
        shopId,
        status: 'PAID',
        paidAt: { not: null },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        merchantPaid: true,
        paidAt: true,
        createdAt: true,
        gateway: true,
        shop: {
          select: {
            gatewaySettings: true,
          },
        },
      },
    });

    console.log(`💰 Found ${paidPayments.length} paid payments for shop ${shopId}`);

    let totalAmountUSDT = 0;
    let awaitingPayoutUSDT = 0;

    // Получаем настройки комиссий шлюзов
    let gatewaySettings: Record<string, any> = {};
    if (paidPayments.length > 0 && paidPayments[0].shop.gatewaySettings) {
      try {
        gatewaySettings = JSON.parse(paidPayments[0].shop.gatewaySettings);
      } catch (error) {
        console.error('Error parsing gateway settings:', error);
        gatewaySettings = {};
      }
    }

    // Конвертируем каждый платеж в USDT и считаем комиссию
    for (const payment of paidPayments) {
      try {
        // Конвертируем в USDT
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        
        // Получаем комиссию для шлюза
        const gatewayDisplayName = this.getGatewayDisplayName(payment.gateway);
        const settings = gatewaySettings[gatewayDisplayName];
        const commission = settings?.commission || 10; // По умолчанию 10%
        
        // Сумма после вычета комиссии (то что получит мерчант)
        const amountAfterCommission = amountUSDT * (1 - commission / 100);
        
        totalAmountUSDT += amountAfterCommission;
        
        // Если мерчанту еще не выплачено
        if (!payment.merchantPaid) {
          awaitingPayoutUSDT += amountAfterCommission;
        }
        
        console.log(`💰 Payment ${payment.id}: ${payment.amount} ${payment.currency} = ${amountUSDT.toFixed(2)} USDT, after ${commission}% commission = ${amountAfterCommission.toFixed(2)} USDT, merchantPaid: ${payment.merchantPaid}`);
      } catch (error) {
        console.error(`Error converting payment ${payment.id}:`, error);
      }
    }

    // Получаем сумму всех выплат
    const payouts = await prisma.payout.findMany({
      where: { shopId },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const totalPaidOutUSDT = payouts.reduce((sum, payout) => sum + payout.amount, 0);

    // Выплаты за текущий месяц
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const thisMonthPayouts = payouts.filter(payout => payout.createdAt >= currentMonth);
    const thisMonthUSDT = thisMonthPayouts.reduce((sum, payout) => sum + payout.amount, 0);

    const result = {
      availableBalance: Math.round(awaitingPayoutUSDT * 100) / 100,
      totalPaidOut: Math.round(totalPaidOutUSDT * 100) / 100,
      awaitingPayout: Math.round(awaitingPayoutUSDT * 100) / 100,
      thisMonth: Math.round(thisMonthUSDT * 100) / 100,
    };

    console.log(`📊 Shop ${shopId} payout stats calculated:`, result);
    console.log(`   💰 Total earnings (after commission): ${totalAmountUSDT.toFixed(2)} USDT`);
    console.log(`   ⏳ Awaiting payout: ${awaitingPayoutUSDT.toFixed(2)} USDT`);
    console.log(`   ✅ Total paid out: ${totalPaidOutUSDT.toFixed(2)} USDT`);
    console.log(`   📅 This month: ${thisMonthUSDT.toFixed(2)} USDT`);

    return result;
  }

  // ✅ ИСПРАВЛЕНО: Обновленный метод getShopPayoutStats
  async getShopPayoutStats(shopId: string): Promise<ShopPayoutStats> {
    return await this.calculateShopPayoutStatsFromPayments(shopId);
  }

  // Payout management routes - Updated for shop payout stats
  async getPayouts(shopId: string, filters: PayoutFilters): Promise<{
    payouts: ShopPayoutResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, status, method, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    if (method) {
      where.network = method.toLowerCase();
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          network: true,
          status: true,
          txid: true,
          notes: true,
          createdAt: true,
          paidAt: true,
        },
      }),
      prisma.payout.count({ where }),
    ]);

    return {
      payouts: payouts.map(payout => ({
        id: payout.id,
        amount: payout.amount,
        network: payout.network,
        status: payout.status,
        txid: payout.txid,
        notes: payout.notes,
        createdAt: payout.createdAt,
        paidAt: payout.paidAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayoutById(shopId: string, payoutId: string): Promise<ShopPayoutResponse | null> {
    const payout = await prisma.payout.findFirst({
      where: {
        id: payoutId,
        shopId,
      },
      select: {
        id: true,
        amount: true,
        network: true,
        status: true,
        txid: true,
        notes: true,
        createdAt: true,
        paidAt: true,
      },
    });

    if (!payout) return null;

    return {
      id: payout.id,
      amount: payout.amount,
      network: payout.network,
      status: payout.status,
      txid: payout.txid,
      notes: payout.notes,
      createdAt: payout.createdAt,
      paidAt: payout.paidAt,
    };
  }

  async getPayoutStatistics(shopId: string, period: string): Promise<PayoutStatistics> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [payouts, recentPayouts] = await Promise.all([
      prisma.payout.findMany({
        where: {
          shopId,
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          amount: true,
          network: true,
          status: true,
          txid: true,
          createdAt: true,
          paidAt: true,
        },
      }),
      prisma.payout.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          amount: true,
          network: true,
          status: true,
          txid: true,
          createdAt: true,
          paidAt: true,
          shop: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const totalPayouts = payouts.length;
    const completedPayouts = payouts.filter(p => p.status === 'COMPLETED').length;
    const pendingPayouts = payouts.filter(p => p.status === 'PENDING').length;
    const rejectedPayouts = payouts.filter(p => p.status === 'REJECTED').length;

    const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);
    const completedAmount = payouts.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = payouts.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amount, 0);

    const payoutsByMethod: Record<string, number> = {};
    const payoutsByStatus: Record<string, number> = {};

    payouts.forEach(payout => {
      payoutsByMethod[payout.network] = (payoutsByMethod[payout.network] || 0) + 1;
      payoutsByStatus[payout.status] = (payoutsByStatus[payout.status] || 0) + 1;
    });

    return {
      totalPayouts,
      completedPayouts,
      pendingPayouts,
      rejectedPayouts,
      totalAmount,
      completedAmount,
      pendingAmount,
      payoutsByMethod,
      payoutsByStatus,
      recentPayouts: recentPayouts.map(payout => ({
        id: payout.id,
        shopId,
        amount: payout.amount,
        method: payout.network,
        status: payout.status as 'PENDING' | 'COMPLETED' | 'REJECTED',
        txid: payout.txid,
        createdAt: payout.createdAt,
        paidAt: payout.paidAt,
        shop: payout.shop,
      })),
    };
  }

  // Legacy method for backward compatibility
  async getPayoutStats(shopId: string): Promise<PayoutStats> {
    const stats = await this.getShopPayoutStats(shopId);
    
    return {
      totalBalance: stats.availableBalance,
      totalPaidOut: stats.totalPaidOut,
      awaitingPayout: stats.awaitingPayout,
      thisMonth: stats.thisMonth,
    };
  }

  // Webhook logs
  async getWebhookLogs(shopId: string, filters: WebhookLogFilters): Promise<{
    logs: WebhookLogResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, paymentId } = filters;
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    
    if (paymentId) {
      where.paymentId = paymentId;
    }

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentId: true,
          shopId: true,
          event: true,
          statusCode: true,
          retryCount: true,
          responseBody: true,
          createdAt: true,
          payment: {
            select: {
              id: true,
              amount: true,
              currency: true,
            },
          },
        },
      }),
      prisma.webhookLog.count({ where }),
    ]);

    return {
      logs: logs.map(log => ({
        id: log.id,
        paymentId: log.paymentId,
        shopId: log.shopId,
        event: log.event,
        statusCode: log.statusCode,
        retryCount: log.retryCount,
        responseBody: log.responseBody,
        createdAt: log.createdAt,
        payment: log.payment,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Statistics
  async getStatistics(shopId: string, period: string): Promise<{
    totalPayments: number;
    successfulPayments: number;
    failedPayments: number;
    totalRevenue: number;
    conversionRate: number;
    averageOrderValue: number;
    recentPayments: any[];
    paymentsByGateway: Record<string, number>;
    paymentsByStatus: Record<string, number>;
    dailyStats: Array<{
      date: string;
      payments: number;
      revenue: number;
    }>;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [payments, recentPayments] = await Promise.all([
      prisma.payment.findMany({
        where: {
          shopId,
          createdAt: { gte: startDate },
        },
        select: {
          id: true,
          gateway: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          gateway: true,
          amount: true,
          currency: true,
          status: true,
          customerEmail: true,
          customerName: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPayments = payments.length;
    const successfulPayments = payments.filter(p => p.status === 'PAID').length;
    const failedPayments = payments.filter(p => p.status === 'FAILED').length;

    // Calculate total revenue in USDT
    let totalRevenue = 0;
    for (const payment of payments.filter(p => p.status === 'PAID')) {
      try {
        const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
        totalRevenue += usdtAmount;
      } catch (error) {
        console.error(`Error converting payment ${payment.id} to USDT:`, error);
      }
    }

    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;
    const averageOrderValue = successfulPayments > 0 ? totalRevenue / successfulPayments : 0;

    const paymentsByGateway: Record<string, number> = {};
    const paymentsByStatus: Record<string, number> = {};

    payments.forEach(payment => {
      const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;
      paymentsByGateway[gatewayId] = (paymentsByGateway[gatewayId] || 0) + 1;
      paymentsByStatus[payment.status] = (paymentsByStatus[payment.status] || 0) + 1;
    });

    // Generate daily stats
    const dailyStats: Array<{ date: string; payments: number; revenue: number }> = [];
    const days = Math.ceil((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayPayments = payments.filter(p => {
        const paymentDate = p.createdAt.toISOString().split('T')[0];
        return paymentDate === dateStr;
      });

      let dayRevenue = 0;
      for (const payment of dayPayments.filter(p => p.status === 'PAID')) {
        try {
          const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
          dayRevenue += usdtAmount;
        } catch (error) {
          console.error(`Error converting payment ${payment.id} to USDT:`, error);
        }
      }

      dailyStats.push({
        date: dateStr,
        payments: dayPayments.length,
        revenue: Math.round(dayRevenue * 100) / 100,
      });
    }

    return {
      totalPayments,
      successfulPayments,
      failedPayments,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      recentPayments: recentPayments.map(payment => {
        const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;
        return {
          ...payment,
          gateway: gatewayId,
        };
      }),
      paymentsByGateway,
      paymentsByStatus,
      dailyStats,
    };
  }
}