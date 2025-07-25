import prisma from '../config/database';
import { CreatePublicPaymentRequest, PaymentStatusResponse, PaymentFilters } from '../types/payment';
import { PlisioService } from './gateways/plisioService';
import { RapydService } from './gateways/rapydService';
import { NodaService } from './gateways/nodaService';
import { CoinToPayService } from './gateways/coinToPayService';
import { KlymeService } from './gateways/klymeService';
import { TestGatewayService } from './gateways/testGatewayService';
import { telegramBotService } from './telegramBotService';
import { coinToPayStatusService } from './coinToPayStatusService';
import { getGatewayNameById, getGatewayIdByName, isValidGatewayId, getKlymeRegionFromGatewayName } from '../types/gateway';

export class PaymentService {
  private plisioService: PlisioService;
  private rapydService: RapydService;
  private nodaService: NodaService;
  private coinToPayService: CoinToPayService;
  private klymeService: KlymeService;
  private testGatewayService: TestGatewayService;

  constructor() {
    this.plisioService = new PlisioService();
    this.rapydService = new RapydService();
    this.nodaService = new NodaService();
    this.coinToPayService = new CoinToPayService();
    this.klymeService = new KlymeService();
    this.testGatewayService = new TestGatewayService();
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

  // ✅ ОБНОВЛЕНО: Унифицированная генерация URL - везде apptest.trapay.uk
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
    // ✅ НОВОЕ: Если все URL переданы мерчантом, используем их
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

    // ✅ ОБНОВЛЕНО: Везде используем apptest.trapay.uk с payment_id параметром
    const dbSuccessUrl = successUrl || `https://apptest.trapay.uk/payment/success?id=${paymentId}&payment_id=${gatewayOrderId}`;
    const dbFailUrl = failUrl || `https://apptest.trapay.uk/payment/fail?id=${paymentId}&payment_id=${gatewayOrderId}`;
    const dbPendingUrl = pendingUrl || `https://apptest.trapay.uk/payment/pending?id=${paymentId}&payment_id=${gatewayOrderId}`;

    // ✅ ОБНОВЛЕНО: Для шлюзов используем tesoft.uk только для внутренних redirect
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
      'test_gateway': 'Test Gateway',
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

  async createPublicPayment(paymentData: CreatePublicPaymentRequest): Promise<{
    id: string;
    gateway_payment_id?: string;
    payment_url?: string;
    status: string;
  }> {
    const {
      public_key,
      gateway: gatewayId,
      order_id,
      amount,
      currency,
      source_currency,
      usage,
      expires_at,
      success_url,
      fail_url,
      pending_url,
      customer_email,
      customer_name,
      country,
      language,
      amount_is_editable,
      max_payments,
      customer,
    } = paymentData;

    if (!isValidGatewayId(gatewayId)) {
      throw new Error(`Invalid gateway ID: ${gatewayId}. Valid IDs are: 0001 (Plisio), 0010 (Rapyd), 0100 (CoinToPay), 1000 (Noda), 1001 (KLYME EU), 1010 (KLYME GB), 1100 (KLYME DE)`);
    }

    const gatewayName = getGatewayNameById(gatewayId);
    if (!gatewayName) {
      throw new Error(`Gateway not found for ID: ${gatewayId}`);
    }

    console.log(`🔄 Processing payment for gateway ID ${gatewayId} (${gatewayName})`);

    this.validateKlymeCurrency(gatewayName, currency || 'USD');

    const shop = await prisma.shop.findUnique({
      where: { publicKey: public_key },
      select: {
        id: true,
        name: true,
        status: true,
        paymentGateways: true,
      },
    });

    if (!shop) {
      throw new Error('Invalid public key');
    }

    if (shop.status !== 'ACTIVE') {
      throw new Error('Shop is not active');
    }

    await this.checkGatewayPermission(shop.id, gatewayName);

    // ✅ НОВОЕ: Проверяем минимальную сумму платежа
    await this.checkMinimumAmount(shop.id, gatewayName, amount);

    const gatewayOrderId = await this.generateGatewayOrderId();
    console.log(`🎯 Generated unique gateway order_id: ${gatewayOrderId} (8digits-8digits format for ${gatewayName})`);

    const merchantOrderId = order_id || null;
    console.log(`📝 Merchant order_id: ${merchantOrderId || 'not provided'}`);

    const payment = await prisma.payment.create({
      data: {
        shopId: shop.id,
        gateway: gatewayName,
        amount,
        currency: currency || 'USD',
        sourceCurrency: source_currency || null,
        usage: usage || 'ONCE',
        expiresAt: expires_at ? new Date(expires_at) : null,
        successUrl: 'temp',
        failUrl: 'temp',
        pendingUrl: 'temp',
        whiteUrl: 'temp', // ✅ НОВОЕ: Временное значение для whiteUrl
        status: 'PENDING',
        orderId: merchantOrderId,
        gatewayOrderId: gatewayOrderId,
        customerEmail: customer_email || null,
        customerName: customer_name || null,
        country: country || null,
        language: language || null,
        amountIsEditable: amount_is_editable || null,
        maxPayments: max_payments || null,
        rapydCustomer: customer || null,
      },
    });

    console.log(`💾 Payment created in database:`);
    console.log(`   - Internal ID: ${payment.id}`);
    console.log(`   - Merchant order_id: ${merchantOrderId || 'none'}`);
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
      success_url, 
      fail_url,
      pending_url
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
        let plisioCurrency: string;
        let plisioSourceCurrency: string;
        let isSourceCurrency: boolean;

        if (source_currency) {
          plisioCurrency = source_currency;
          plisioSourceCurrency = currency || 'USD';
          isSourceCurrency = false;
        } else {
          plisioCurrency = currency || 'USD';
          plisioSourceCurrency = 'USD';
          isSourceCurrency = false;
        }

        const plisioResult = await this.plisioService.createPayment({
          paymentId: payment.id,
          orderId: gatewayOrderId,
          amount,
          currency: plisioCurrency,
          productName: `Order ID: ${gatewayOrderId}`,
          description: `Order ID: ${gatewayOrderId}`,
          successUrl: finalSuccessUrl,
          failUrl: finalFailUrl,
          customerEmail: customer_email,
          customerName: customer_name,
          isSourceCurrency: isSourceCurrency,
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

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`🔗 Plisio payment URL: ${paymentUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: gatewayPaymentId,
          payment_url: paymentUrl,
          status: payment.status,
        };

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
          amountIsEditable: amount_is_editable || false,
          usage: usage || 'ONCE',
          maxPayments: max_payments,
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

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`🔗 Rapyd payment URL: ${paymentUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: gatewayPaymentId,
          payment_url: paymentUrl,
          status: payment.status,
        };

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
          expiryDate: expires_at,
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

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`🔗 Noda payment URL: ${paymentUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: gatewayPaymentId,
          payment_url: paymentUrl,
          status: payment.status,
        };

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

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`🔗 CoinToPay payment URL: ${paymentUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: gatewayPaymentId,
          payment_url: paymentUrl,
          status: payment.status,
        };

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

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`✅ KLYME ${region} payment created successfully with gateway order_id: ${gatewayOrderId}`);
        console.log(`🔗 KLYME ${region} payment URL: ${paymentUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: gatewayPaymentId,
          payment_url: paymentUrl,
          status: payment.status,
        };

      } else if (gatewayName === 'test_gateway') {
        console.log(`🧪 Creating Test Gateway payment with gateway order_id: ${gatewayOrderId} (8digits-8digits format)`);
        console.log(`💰 Amount: ${amount} ${currency || 'USD'} (Test Gateway)`);

        // For test gateway, we create a payment form URL instead of external payment URL
        const testGatewayFormUrl = `https://apptest.trapay.uk/test-gateway/payment/${payment.id}`;
        
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            externalPaymentUrl: testGatewayFormUrl,
            gatewayPaymentId: `test_${gatewayOrderId}`, // Temporary ID until card is processed
          },
        });

        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;
        console.log(`🔗 Test Gateway payment URL: ${paymentUrl}`);
        console.log(`🧪 Test Gateway form URL: ${testGatewayFormUrl}`);

        return {
          id: payment.id,
          gateway_payment_id: `test_${gatewayOrderId}`,
          payment_url: paymentUrl,
          status: payment.status,
        };

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
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse | null> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        gateway: true,
        amount: true,
        currency: true,
        sourceCurrency: true,
        status: true,
        externalPaymentUrl: true,
        successUrl: true,
        failUrl: true,
        pendingUrl: true,
        whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
        customerEmail: true,
        customerName: true,
        invoiceTotalSum: true,
        qrCode: true,
        qrUrl: true,
        txUrls: true,
        orderId: true,
        gatewayOrderId: true,
        country: true,
        language: true,
        amountIsEditable: true,
        maxPayments: true,
        rapydCustomer: true,
        cardLast4: true,
        paymentMethod: true,
        bankId: true,
        remitterIban: true,
        remitterName: true,
        failureMessage: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        shop: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!payment) return null;

    // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
    const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;

    let txUrls: string[] | null = null;
    if (payment.txUrls) {
      try {
        txUrls = JSON.parse(payment.txUrls);
      } catch (error) {
        console.error('Error parsing tx_urls:', error);
        txUrls = null;
      }
    }

    // ✅ НОВОЕ: Получаем gateway ID вместо имени
    const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

    return {
      id: payment.id,
      gateway: gatewayId, // ✅ ИЗМЕНЕНО: Возвращаем gateway ID
      amount: payment.amount,
      currency: payment.currency,
      source_currency: payment.sourceCurrency,
      status: payment.status,
      payment_url: paymentUrl,
      external_payment_url: payment.externalPaymentUrl,
      success_url: payment.successUrl,
      fail_url: payment.failUrl,
      pending_url: payment.pendingUrl,
      white_url: payment.whiteUrl, // ✅ НОВОЕ: Добавлено поле white_url
      customer_email: payment.customerEmail,
      customer_name: payment.customerName,
      invoice_total_sum: payment.invoiceTotalSum,
      qr_code: payment.qrCode,
      qr_url: payment.qrUrl,
      tx_urls: txUrls,
      order_id: payment.orderId,
      gateway_order_id: payment.gatewayOrderId,
      merchant_brand: payment.shop.name,
      country: payment.country,
      language: payment.language,
      amount_is_editable: payment.amountIsEditable,
      max_payments: payment.maxPayments,
      rapyd_customer: payment.rapydCustomer,
      card_last4: payment.cardLast4,
      payment_method: payment.paymentMethod,
      bank_id: payment.bankId,
      remitter_iban: payment.remitterIban,
      remitter_name: payment.remitterName,
      failure_message: payment.failureMessage,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
      expires_at: payment.expiresAt,
    };
  }

  async getPaymentById(id: string): Promise<PaymentStatusResponse | null> {
    console.log(`🔍 Searching for payment with ID: ${id}`);
    console.log(`🔍 Will search by: internal ID, merchant order ID, gateway order ID, and gateway payment ID`);

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: id },
          { orderId: id },
          { gatewayOrderId: id },
          { gatewayPaymentId: id },
        ],
      },
      select: {
        id: true,
        gateway: true,
        amount: true,
        currency: true,
        sourceCurrency: true,
        status: true,
        externalPaymentUrl: true,
        successUrl: true,
        failUrl: true,
        pendingUrl: true,
        whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
        customerEmail: true,
        customerName: true,
        invoiceTotalSum: true,
        qrCode: true,
        qrUrl: true,
        txUrls: true,
        orderId: true,
        gatewayOrderId: true,
        gatewayPaymentId: true,
        country: true,
        language: true,
        amountIsEditable: true,
        maxPayments: true,
        rapydCustomer: true,
        cardLast4: true,
        paymentMethod: true,
        bankId: true,
        remitterIban: true,
        remitterName: true,
        failureMessage: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        shop: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!payment) {
      console.log(`❌ Payment not found with any of the following criteria:`);
      console.log(`   - Internal ID: ${id}`);
      console.log(`   - Merchant order ID: ${id}`);
      console.log(`   - Gateway order ID: ${id}`);
      console.log(`   - Gateway payment ID: ${id}`);
      return null;
    }

    console.log(`✅ Found payment: ${payment.id}`);
    console.log(`   - Internal ID: ${payment.id}`);
    console.log(`   - Merchant order ID: ${payment.orderId || 'none'}`);
    console.log(`   - Gateway order ID: ${payment.gatewayOrderId || 'none'}`);
    console.log(`   - Gateway payment ID: ${payment.gatewayPaymentId || 'none'}`);
    console.log(`   - Gateway: ${payment.gateway}`);
    console.log(`   - Status: ${payment.status}`);
    console.log(`   - White URL: ${payment.whiteUrl || 'none'}`); // ✅ НОВОЕ: Логируем whiteUrl
    
    if (payment.failureMessage) {
      console.log(`   - Failure Message: ${payment.failureMessage}`);
    }

    // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
    const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;

    let txUrls: string[] | null = null;
    if (payment.txUrls) {
      try {
        txUrls = JSON.parse(payment.txUrls);
        //@ts-ignore
        // ✅ НОВОЕ: Логируем количество tx_urls
        console.log(`   - Transaction URLs: ${txUrls.length} URLs found`);
      } catch (error) {
        console.error('Error parsing tx_urls:', error);
        txUrls = null;
      }
    }

    // ✅ НОВОЕ: Получаем gateway ID вместо имени
    const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

    return {
      id: payment.id,
      gateway: gatewayId, // ✅ ИЗМЕНЕНО: Возвращаем gateway ID
      amount: payment.amount,
      currency: payment.currency,
      source_currency: payment.sourceCurrency,
      status: payment.status,
      payment_url: paymentUrl,
      external_payment_url: payment.externalPaymentUrl,
      success_url: payment.successUrl,
      fail_url: payment.failUrl,
      pending_url: payment.pendingUrl,
      white_url: payment.whiteUrl, // ✅ НОВОЕ: Добавлено поле white_url
      customer_email: payment.customerEmail,
      customer_name: payment.customerName,
      invoice_total_sum: payment.invoiceTotalSum,
      qr_code: payment.qrCode,
      qr_url: payment.qrUrl,
      tx_urls: txUrls,
      order_id: payment.orderId,
      gateway_order_id: payment.gatewayOrderId,
      merchant_brand: payment.shop.name,
      card_last4: payment.cardLast4,
      payment_method: payment.paymentMethod,
      bank_id: payment.bankId,
      remitter_iban: payment.remitterIban,
      remitter_name: payment.remitterName,
      failure_message: payment.failureMessage,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
      expires_at: payment.expiresAt,
    };
  }

  async getPaymentsByShop(shopId: string, filters: PaymentFilters): Promise<{
    payments: any[];
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
          gateway: true,
          amount: true,
          currency: true,
          sourceCurrency: true,
          usage: true,
          status: true,
          externalPaymentUrl: true,
          successUrl: true,
          failUrl: true,
          pendingUrl: true,
          whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
          expiresAt: true,
          orderId: true,
          gatewayOrderId: true,
          customerEmail: true,
          customerName: true,
          invoiceTotalSum: true,
          qrCode: true,
          qrUrl: true,
          txUrls: true,
          country: true,
          language: true,
          amountIsEditable: true,
          maxPayments: true,
          rapydCustomer: true,
          cardLast4: true,
          paymentMethod: true,
          bankId: true,
          remitterIban: true,
          remitterName: true,
          failureMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map(payment => {
        // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
        const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;

        let txUrls: string[] | null = null;
        if (payment.txUrls) {
          try {
            txUrls = JSON.parse(payment.txUrls);
          } catch (error) {
            console.error('Error parsing tx_urls:', error);
            txUrls = null;
          }
        }

        // ✅ НОВОЕ: Получаем gateway ID вместо имени
        const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

        return {
          id: payment.id,
          gateway: gatewayId, // ✅ ИЗМЕНЕНО: Возвращаем gateway ID
          title: `Order ID: ${payment.gatewayOrderId}`,
          amount: payment.amount,
          currency: payment.currency,
          source_currency: payment.sourceCurrency,
          usage: payment.usage,
          status: payment.status.toLowerCase(),
          payment_url: paymentUrl,
          external_payment_url: payment.externalPaymentUrl,
          success_url: payment.successUrl,
          fail_url: payment.failUrl,
          pending_url: payment.pendingUrl,
          white_url: payment.whiteUrl, // ✅ НОВОЕ: Добавлено поле white_url
          expires_at: payment.expiresAt,
          order_id: payment.orderId,
          gateway_order_id: payment.gatewayOrderId,
          customer_email: payment.customerEmail,
          customer_name: payment.customerName,
          invoice_total_sum: payment.invoiceTotalSum,
          qr_code: payment.qrCode,
          qr_url: payment.qrUrl,
          tx_urls: txUrls,
          country: payment.country,
          language: payment.language,
          amount_is_editable: payment.amountIsEditable,
          max_payments: payment.maxPayments,
          rapyd_customer: payment.rapydCustomer,
          card_last4: payment.cardLast4,
          payment_method: payment.paymentMethod,
          bank_id: payment.bankId,
          remitter_iban: payment.remitterIban,
          remitter_name: payment.remitterName,
          failure_message: payment.failureMessage,
          created_at: payment.createdAt,
          updated_at: payment.updatedAt,
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

  async getPaymentByShopAndId(shopId: string, paymentId: string): Promise<any | null> {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        shopId,
      },
      select: {
        id: true,
        gateway: true,
        amount: true,
        currency: true,
        sourceCurrency: true,
        usage: true,
        status: true,
        externalPaymentUrl: true,
        successUrl: true,
        failUrl: true,
        pendingUrl: true,
        whiteUrl: true, // ✅ НОВОЕ: Добавлено поле whiteUrl
        expiresAt: true,
        orderId: true,
        gatewayOrderId: true,
        gatewayPaymentId: true,
        customerEmail: true,
        customerName: true,
        invoiceTotalSum: true,
        qrCode: true,
        qrUrl: true,
        txUrls: true,
        country: true,
        language: true,
        amountIsEditable: true,
        maxPayments: true,
        rapydCustomer: true,
        cardLast4: true,
        paymentMethod: true,
        bankId: true,
        remitterIban: true,
        remitterName: true,
        failureMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payment) return null;

    // ✅ ОБНОВЛЕНО: Везде возвращаем apptest.trapay.uk
    const paymentUrl = `https://apptest.trapay.uk/payment/${payment.id}`;

    let txUrls: string[] | null = null;
    if (payment.txUrls) {
      try {
        txUrls = JSON.parse(payment.txUrls);
      } catch (error) {
        console.error('Error parsing tx_urls:', error);
        txUrls = null;
      }
    }

    // ✅ НОВОЕ: Получаем gateway ID вместо имени
    const gatewayId = getGatewayIdByName(payment.gateway) || payment.gateway;

    return {
      id: payment.id,
      gateway: gatewayId, // ✅ ИЗМЕНЕНО: Возвращаем gateway ID
      title: `Order ID: ${payment.gatewayOrderId}`,
      amount: payment.amount,
      currency: payment.currency,
      source_currency: payment.sourceCurrency,
      usage: payment.usage,
      status: payment.status.toLowerCase(),
      payment_url: paymentUrl,
      external_payment_url: payment.externalPaymentUrl,
      success_url: payment.successUrl,
      fail_url: payment.failUrl,
      pending_url: payment.pendingUrl,
      white_url: payment.whiteUrl, // ✅ НОВОЕ: Добавлено поле white_url
      expires_at: payment.expiresAt,
      order_id: payment.orderId,
      gateway_order_id: payment.gatewayOrderId,
      gateway_payment_id: payment.gatewayPaymentId,
      customer_email: payment.customerEmail,
      customer_name: payment.customerName,
      invoice_total_sum: payment.invoiceTotalSum,
      qr_code: payment.qrCode,
      qr_url: payment.qrUrl,
      tx_urls: txUrls,
      country: payment.country,
      language: payment.language,
      amount_is_editable: payment.amountIsEditable,
      max_payments: payment.maxPayments,
      rapyd_customer: payment.rapydCustomer,
      card_last4: payment.cardLast4,
      payment_method: payment.paymentMethod,
      bank_id: payment.bankId,
      remitter_iban: payment.remitterIban,
      remitter_name: payment.remitterName,
      failure_message: payment.failureMessage,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }
}