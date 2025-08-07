import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { loggerService } from '../loggerService';

export interface MasterCardPaymentRequest {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  cardData: {
    number: string;
    expire_month: string;
    expire_year: string;
    cvv: string;
  };
  resultUrl: string;
  returnUrl: string;
  cardHolder: {
    first_name: string;
    last_name: string;
    email: string;
  };
  browser: {
    accept_header: string;
    color_depth: number;
    ip: string;
    language: string;
    screen_height: number;
    screen_width: number;
    time_different: number;
    user_agent: string;
    java_enabled: number;
    window_height: number;
    window_width: number;
  };
}

export interface MasterCardPaymentResponse {
  gateway_payment_id?: string;
  payment_url?: string;
  requires_3ds?: boolean;
  threeds_url?: string;
  status?: 'PENDING' | 'PAID' | 'FAILED';
  final?: boolean;
}

export interface MasterCardApiResponse {
  status?: number;
  final?: number;
  payment_id?: number;
  amount?: number;
  currency?: string;
  order_id?: string;
  date_success?: string;
  desc?: string;
  '3ds_url'?: string;
  info?: string;
  key?: string;
  sign?: string;
  error?: string;
  message?: string;
}

export class MasterCardService {
  private apiUrl: string;
  private merchantPointId: number;
  private privateKeyPath: string;
  private publicKeyPath: string;
  
  // Хранилище для проверки статуса платежей
  private statusCheckTimers: Map<string, NodeJS.Timeout[]> = new Map();

  constructor() {
    this.apiUrl = 'https://api.paydmeth.com/api';
    this.merchantPointId = 1660;
    this.privateKeyPath = path.join(process.cwd(), 'keys', 'private.pem');
    this.publicKeyPath = path.join(process.cwd(), 'keys', 'psp_public.pem');
    
    console.log('💳 MasterCard service initialized');
    console.log('🔐 Private key path:', this.privateKeyPath);
    console.log('🔐 Public key path:', this.publicKeyPath);
    
    // ✅ ДОБАВЛЕНО: Проверяем наличие файлов ключей при инициализации
    this.validateKeyFiles();
  }

  // ✅ НОВОЕ: Метод для проверки наличия и валидности файлов ключей
  private validateKeyFiles(): void {
    try {
      if (!fs.existsSync(this.privateKeyPath)) {
        throw new Error(`Private key file not found: ${this.privateKeyPath}`);
      }
      
      if (!fs.existsSync(this.publicKeyPath)) {
        throw new Error(`Public key file not found: ${this.publicKeyPath}`);
      }
      
      const privateKeyContent = fs.readFileSync(this.privateKeyPath, 'utf8').trim();
      const publicKeyContent = fs.readFileSync(this.publicKeyPath, 'utf8').trim();
      
      if (!privateKeyContent.includes('-----BEGIN') || !privateKeyContent.includes('-----END')) {
        throw new Error('Private key file does not appear to be in PEM format');
      }
      
      if (!publicKeyContent.includes('-----BEGIN') || !publicKeyContent.includes('-----END')) {
        throw new Error('Public key file does not appear to be in PEM format');
      }
      
      console.log('✅ MasterCard key files validated successfully');
      console.log(`🔐 Private key length: ${privateKeyContent.length} characters`);
      console.log(`🔐 Public key length: ${publicKeyContent.length} characters`);
      
    } catch (error) {
      console.error('❌ MasterCard key validation failed:', error);
      throw error;
    }
  }

  // ✅ ОБНОВЛЕНО: Генерация AES ключа и IV для AES-256-CTR
  private generateAESKey(): { key: Buffer; iv: Buffer } {
    const key = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16);  // 128-bit IV
    return { key, iv };
  }

  // ✅ ОБНОВЛЕНО: Шифрование данных с помощью AES-256-CTR
  private encryptAES(data: string, key: Buffer, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  }

  // ✅ ОБНОВЛЕНО: Шифрование AES ключа и IV с помощью RSA (как в Python примере)
  private encryptRSA(key: Buffer, iv: Buffer): string {
    try {
      const publicKey = fs.readFileSync(this.publicKeyPath, 'utf8').trim(); // ✅ ИСПРАВЛЕНО: Добавлен .trim()
      
      // Создаем JSON с ключом и IV как в Python примере
      const keyData = {
        iv: iv.toString('base64'),
        key: key.toString('base64'),
      };
      
      const keyJson = JSON.stringify(keyData);
      
      console.log('🔐 RSA encryption - Key structure JSON length:', keyJson.length);
      
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(keyJson)
      );
      
      console.log('✅ RSA encryption successful, encrypted length:', encrypted.length);
      return encrypted.toString('base64');
    } catch (error) {
      console.error('❌ RSA encryption failed:', error);
      throw new Error('Failed to encrypt with RSA public key');
    }
  }

  // ✅ ИСПРАВЛЕНО: Подпись данных с помощью RSA приватного ключа
  private signRSA(data: string): string {
    try {
      const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8').trim(); // ✅ ИСПРАВЛЕНО: Добавлен .trim()
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      sign.end(); // ✅ ИСПРАВЛЕНО: Добавлен обязательный вызов sign.end()
      const signature = sign.sign(privateKey, 'base64');
      
      console.log('🔐 RSA signing successful');
      console.log('📝 Data to sign length:', data.length);
      console.log('📝 Signature length:', signature.length);
      
      return signature;
    } catch (error) {
      console.error('❌ RSA signing failed:', error);
      console.error('❌ Data being signed:', data.substring(0, 200) + '...');
      throw new Error('Failed to sign with RSA private key');
    }
  }

  // ✅ ОБНОВЛЕНО: Расшифровка AES данных с помощью AES-256-CTR
  private decryptAES(encryptedData: string, key: Buffer, iv: Buffer): string {
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private async decryptResponsePhp(encryptedInfo: string, encryptedKey: string): Promise<string> {
    try {
      const response = await fetch('https://api2.trapay.uk/decrypt.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info: encryptedInfo, key: encryptedKey })
      });
      if (!response.ok) throw new Error('PHP decryptor error');
      return await response.text();
    } catch (error) {
      console.error('❌ PHP decryptor request failed:', error);
      throw new Error('Failed to decrypt response via PHP');
    }
  }

  private decryptResponse(encryptedInfo: string, encryptedKey: string): string {
    try {
      const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8').trim(); 
      const decryptedKeyBuffer = crypto.privateDecrypt(privateKey, Buffer.from(encryptedKey, 'base64'));
      const keyData = JSON.parse(decryptedKeyBuffer.toString());
      const key = Buffer.from(keyData.key, 'base64');
      const iv = Buffer.from(keyData.iv, 'base64');
      return this.decryptAES(encryptedInfo, key, iv);
    } catch (error) {
      throw new Error('Failed to decrypt response');
    }
  }

  async processCardPayment(paymentData: MasterCardPaymentRequest): Promise<MasterCardPaymentResponse> {
    const {
      paymentId,
      orderId,
      amount,
      currency,
      cardData,
      resultUrl,
      returnUrl,
      cardHolder,
      browser,
    } = paymentData;

    console.log('=== MASTERCARD PAYMENT PROCESSING ===');
    console.log('Payment ID:', paymentId);
    console.log('Order ID:', orderId);
    console.log('Amount:', amount, currency);
    console.log('Card Number:', this.maskCardNumber(cardData.number));
    console.log('Card Holder:', `${cardHolder.first_name} ${cardHolder.last_name}`);
    console.log('Return URL:', returnUrl);
    console.log('Result URL:', resultUrl);

    const paymentRequestData = {
      amount: amount,
      currency: currency.toUpperCase(),
      order_id: orderId,
      result_url: resultUrl,
      return_url: returnUrl,
      country: '',
      card: {
        number: cardData.number,
        expire_month: cardData.expire_month,
        expire_year: cardData.expire_year,
        cvv: cardData.cvv,
      },
      card_holder: cardHolder,
      browser: browser,
    };

    const dataJson = JSON.stringify(paymentRequestData);
    console.log('💾 Payment data prepared');
    console.log('📝 Data to be signed and encrypted:');
    console.log(dataJson);
    console.log('📝 Data length:', dataJson.length);

    try {
      const { key: aesKey, iv: aesIv } = this.generateAESKey();
      console.log('🔐 AES key and IV generated');
      console.log('🔐 AES key length:', aesKey.length);
      console.log('🔐 AES IV length:', aesIv.length);

      const encryptedData = this.encryptAES(dataJson, aesKey, aesIv);
      console.log('🔐 Data encrypted with AES');
      console.log('📝 Encrypted data length:', encryptedData.length);

      const encryptedKey = this.encryptRSA(aesKey, aesIv);
      console.log('🔐 AES key+IV encrypted with RSA');
      console.log('📝 Encrypted key length:', encryptedKey.length);

      const signature = this.signRSA(dataJson);
      console.log('🔐 Data signed with RSA');
      console.log('📝 Signature length:', signature.length);

      const finalRequest = {
        merchant_point_id: this.merchantPointId,
        method: 'charge',
        info: encryptedData,
        key: encryptedKey,
        sign: signature,
        lang: 'en',
      };

      console.log('📤 Sending request to MasterCard API...');
      console.log('📝 Final request structure:');
      console.log('   - merchant_point_id:', this.merchantPointId);
      console.log('   - method: charge');
      console.log('   - info length:', encryptedData.length);
      console.log('   - key length:', encryptedKey.length);
      console.log('   - sign length:', signature.length);
      console.log('   - lang: en');

      loggerService.logWhiteDomainRequest('mastercard', '/charge', 'POST', {
        merchant_point_id: this.merchantPointId,
        method: 'charge',
        lang: 'en',
      });

      const startTime = Date.now();

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0',
        },
        body: JSON.stringify(finalRequest),
      });

      const responseTime = Date.now() - startTime;

      console.log('=== MASTERCARD API RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Response Time:', responseTime + 'ms');

      if (!response.ok) {
        const responseText = await response.text();
        console.error('HTTP Status:', response.status);
        console.error('Response Body:', responseText);
        
        loggerService.logWhiteDomainResponse('mastercard', '/charge_raw', response.status, responseText, responseTime);
        loggerService.logWhiteDomainError('mastercard', '/charge', `HTTP ${response.status}: ${responseText}`);
        
        throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
      }

      const result = await response.json() as MasterCardApiResponse;
      
      loggerService.logWhiteDomainResponse('mastercard', '/charge_raw', response.status, result, responseTime);
      
      console.log('=== PARSED MASTERCARD RESPONSE ===');
      
      let decryptedResult: any = result;
      
      if (result.info && result.key && result.sign) {
        console.log('🔐 Response is encrypted, decrypting...');
        try {
          const decryptedInfo = await this.decryptResponsePhp(result.info, result.key);
          decryptedResult = JSON.parse(decryptedInfo);
          console.log('✅ Response decrypted successfully (via PHP)');
          loggerService.logWhiteDomainResponse('mastercard', '/charge_decrypted', response.status, decryptedResult, responseTime);
          console.log('📝 Decrypted response logged to white_domain_responses with endpoint: /charge_decrypted');
        } catch (decryptError) {
          console.error('❌ Failed to decrypt response (PHP):', decryptError);
          loggerService.logWhiteDomainError('mastercard', '/charge_decrypt', `Decryption failed: ${decryptError}`);
          decryptedResult = result;
        }
      } else {
        loggerService.logWhiteDomainResponse('mastercard', '/charge_decrypted', response.status, decryptedResult, responseTime);
        console.log('📝 Unencrypted response logged to white_domain_responses with endpoint: /charge_decrypted');
      }
      
      console.log('Status:', decryptedResult.status);
      console.log('Final:', decryptedResult.final);
      console.log('Payment ID:', decryptedResult.payment_id);
      console.log('3DS URL:', decryptedResult['3ds_url'] || 'none');



      if (decryptedResult.status === 100 && decryptedResult.final === 1) {
        console.log('✅ Payment successful');
        return {
          gateway_payment_id: decryptedResult.payment_id?.toString(),
          payment_url: returnUrl,
          requires_3ds: false,
          status: 'PAID',
          final: true,
        };
      }

      if (decryptedResult['3ds_url']) {
        console.log('🔐 3DS verification required');
        this.scheduleStatusChecks(paymentId, orderId, decryptedResult.payment_id?.toString() || orderId);
        return {
          gateway_payment_id: decryptedResult.payment_id?.toString(),
          payment_url: decryptedResult['3ds_url'],
          requires_3ds: true,
          threeds_url: decryptedResult['3ds_url'],
          status: 'PENDING',
          final: false,
        };
      }

      // Ошибка или отказ
      let errorDescription = decryptedResult.desc || decryptedResult.message || 'Unknown error';
      let errorCode = decryptedResult.status;
      let errorFinal = decryptedResult.final;
      console.log(`❌ Payment failed or declined. Status: ${errorCode}, Final: ${errorFinal}, Desc: ${errorDescription}`);
      return {
        gateway_payment_id: decryptedResult.payment_id?.toString(),
        payment_url: returnUrl,
        requires_3ds: false,
        status: 'FAILED',
        final: true,
      };

    } catch (error) {
      console.error('=== MASTERCARD SERVICE ERROR ===');
      console.error('Error details:', error);
      
      loggerService.logWhiteDomainError('mastercard', '/charge', error);
      
      throw new Error(`Failed to process MasterCard payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Проверка статуса платежа
  async checkPaymentStatus(paymentId: string, orderId: string): Promise<{
    status: 'PENDING' | 'PAID' | 'FAILED';
    final: boolean;
    amount?: number;
    currency?: string;
    date_success?: string;
    description?: string;
  }> {
    console.log(`📊 Checking MasterCard payment status: ${paymentId} (${orderId})`);

    try {
      // Подготавливаем данные для проверки статуса
      const statusRequestData = {
        payment_id: paymentId,
        order_id: orderId,
      };

      const dataJson = JSON.stringify(statusRequestData);

      // Генерируем AES ключ и IV
      const { key: aesKey, iv: aesIv } = this.generateAESKey();

      // Шифруем данные
      const encryptedData = this.encryptAES(dataJson, aesKey, aesIv);

      // Шифруем ключ
      const encryptedKey = this.encryptRSA(aesKey, aesIv);

      // Подписываем данные
      const signature = this.signRSA(dataJson);

      // Собираем запрос статуса
      const statusRequest = {
        merchant_point_id: this.merchantPointId,
        method: 'status',
        info: encryptedData,
        key: encryptedKey,
        sign: signature,
        lang: 'en',
      };

      loggerService.logWhiteDomainRequest('mastercard', '/status', 'POST', {
        merchant_point_id: this.merchantPointId,
        method: 'status',
        lang: 'en',
      });

      const startTime = Date.now();

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0',
        },
        body: JSON.stringify(statusRequest),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const responseText = await response.text();
        loggerService.logWhiteDomainResponse('mastercard', '/status_raw', response.status, responseText, responseTime);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json() as MasterCardApiResponse;
      
      // ✅ НОВОЕ: Логируем исходный зашифрованный ответ статуса
      loggerService.logWhiteDomainResponse('mastercard', '/status_raw', response.status, result, responseTime);
      
      // ✅ НОВОЕ: Обрабатываем зашифрованный ответ если есть
      let decryptedResult: any = result;
      
      if (result.info && result.key && result.sign) {
        console.log('🔐 Status response is encrypted, decrypting...');
        
        try {
          const decryptedInfo = this.decryptResponse(result.info, result.key);
          decryptedResult = JSON.parse(decryptedInfo);
          console.log('✅ Status response decrypted successfully');
          
          // ✅ НОВОЕ: Логируем расшифрованный ответ статуса
          loggerService.logWhiteDomainResponse('mastercard', '/status_decrypted', response.status, decryptedResult, responseTime);
          console.log('📝 Decrypted status response logged to white_domain_responses with endpoint: /status_decrypted');
        } catch (decryptError) {
          console.error('❌ Failed to decrypt status response:', decryptError);
          loggerService.logWhiteDomainError('mastercard', '/status_decrypt', `Status decryption failed: ${decryptError}`);
          decryptedResult = result;
        }
      } else {
        // ✅ НОВОЕ: Если ответ статуса не зашифрован, логируем его как есть
        loggerService.logWhiteDomainResponse('mastercard', '/status_decrypted', response.status, decryptedResult, responseTime);
        console.log('📝 Unencrypted status response logged to white_domain_responses with endpoint: /status_decrypted');
      }
      

      console.log('📊 Status check result:', {
        status: decryptedResult.status,
        final: decryptedResult.final,
        payment_id: decryptedResult.payment_id,
        desc: decryptedResult.desc,
      });

      // Определяем статус
      let status: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';
      
      if (decryptedResult.status === 1 && decryptedResult.final === 1) {
        status = 'PAID';
      } else if (decryptedResult.status === 0 && decryptedResult.final === 0) {
        status = 'PENDING';
      } else {
        status = 'FAILED';
      }

      return {
        status,
        final: decryptedResult.final === 1,
        amount: decryptedResult.amount,
        currency: decryptedResult.currency,
        date_success: decryptedResult.date_success,
        description: decryptedResult.desc,
      };

    } catch (error) {
      console.error('MasterCard status check error:', error);
      loggerService.logWhiteDomainError('mastercard', '/status', error);
      throw new Error(`Failed to check MasterCard payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Запуск периодической проверки статуса (каждые 5 минут в течение 2 часов)
  private scheduleStatusChecks(paymentId: string, orderId: string, gatewayPaymentId: string): void {
    console.log(`⏰ Scheduling status checks for MasterCard payment: ${paymentId} (${gatewayPaymentId})`);

    // Очищаем существующие таймеры для этого платежа
    this.clearStatusTimers(paymentId);

    const timers: NodeJS.Timeout[] = [];
    const checkInterval = 5 * 60 * 1000; // 5 минут
    const totalDuration = 2 * 60 * 60 * 1000; // 2 часа
    const maxChecks = Math.floor(totalDuration / checkInterval); // 24 проверки

    console.log(`⏰ Will check status ${maxChecks} times every 5 minutes for 2 hours`);

    for (let i = 1; i <= maxChecks; i++) {
      const timer = setTimeout(async () => {
        console.log(`🔍 MasterCard status check #${i}/${maxChecks} for payment ${paymentId}`);
        
        try {
          const statusResult = await this.checkPaymentStatus(gatewayPaymentId, orderId);
          
          console.log(`📊 Status check #${i} result:`, statusResult);

          // Если платеж завершен (успешно или неуспешно), останавливаем проверки
          if (statusResult.final) {
            console.log(`✅ Payment ${paymentId} is final (${statusResult.status}), stopping status checks`);
            this.clearStatusTimers(paymentId);
            
            // Обновляем статус в базе данных
            await this.updatePaymentStatus(paymentId, statusResult.status, statusResult);
          }
          
        } catch (error) {
          console.error(`❌ Status check #${i} failed for payment ${paymentId}:`, error);
        }
      }, i * checkInterval);

      timers.push(timer);
    }

    // Сохраняем таймеры
    this.statusCheckTimers.set(paymentId, timers);

    console.log(`✅ Scheduled ${maxChecks} status checks for payment ${paymentId}`);
  }

  // Очистка таймеров статуса для платежа
  private clearStatusTimers(paymentId: string): void {
    const timers = this.statusCheckTimers.get(paymentId);
    
    if (timers) {
      console.log(`🧹 Clearing ${timers.length} status timers for payment ${paymentId}`);
      
      timers.forEach((timer, index) => {
        clearTimeout(timer);
      });
      
      this.statusCheckTimers.delete(paymentId);
    }
  }

  // Обновление статуса платежа в базе данных
  private async updatePaymentStatus(paymentId: string, status: string, statusData: any): Promise<void> {
    try {
      const prisma = (await import('../../config/database')).default;
      
      const updateData: any = {
        status: status.toUpperCase(),
        updatedAt: new Date(),
        statusChangedBy: 'system',
        statusChangedAt: new Date(),
      };

      if (status === 'PAID') {
        updateData.paidAt = new Date();
      }

      if (statusData.description) {
        updateData.adminNotes = `MasterCard: ${statusData.description}`;
      }

      await prisma.payment.update({
        where: { id: paymentId },
        data: updateData,
      });

      console.log(`✅ Payment ${paymentId} status updated to ${status}`);

      // Отправляем уведомления (webhook и Telegram)
      await this.sendPaymentNotifications(paymentId, status);

    } catch (error) {
      console.error(`❌ Failed to update payment status for ${paymentId}:`, error);
    }
  }

  // Отправка уведомлений о статусе платежа
  private async sendPaymentNotifications(paymentId: string, status: string): Promise<void> {
    try {
      const prisma = (await import('../../config/database')).default;
      const { telegramBotService } = await import('../telegramBotService');
      
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          shop: {
            include: {
              settings: true,
            },
          },
        },
      });

      if (!payment) return;

      // Отправляем Telegram уведомление
      const statusMap: Record<string, 'paid' | 'failed'> = {
        'PAID': 'paid',
        'FAILED': 'failed',
      };

      const telegramStatus = statusMap[status];
      if (telegramStatus) {
        await telegramBotService.sendPaymentNotification(payment.shopId, payment, telegramStatus);
      }

      // Отправляем webhook мерчанту
      await this.sendShopWebhook(payment, status);

    } catch (error) {
      console.error('Failed to send payment notifications:', error);
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
          created_at: payment.createdAt,
          updated_at: new Date(),
        },
      };

      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (MasterCard)',
        },
        body: JSON.stringify(webhookPayload),
      });

      const responseTime = Date.now() - startTime;

      loggerService.logShopWebhookSent(
        payment.shopId,
        settings.webhookUrl,
        eventName,
        response.status,
        responseTime,
        webhookPayload
      );

      console.log(`MasterCard webhook sent to ${settings.webhookUrl} with status ${response.status} (${responseTime}ms)`);

    } catch (error) {
      console.error('Failed to send MasterCard webhook:', error);
      
      loggerService.logShopWebhookError(
        payment.shopId,
        payment.shop?.settings?.webhookUrl || 'unknown',
        'webhook_send',
        error,
        {}
      );
    }
  }

  // Маскировка номера карты для логов
  private maskCardNumber(cardNumber: string): string {
    const clean = cardNumber.replace(/[\s-]/g, '');
    if (clean.length < 4) return '****';
    return '**** **** **** ' + clean.slice(-4);
  }

  // Метод для обработки webhook (если потребуется)
  async processWebhook(webhookData: any): Promise<{
    paymentId: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
  }> {
    console.log('Processing MasterCard webhook:', webhookData);
    
    let status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' = 'PENDING';
    
    if (webhookData.status === 1 && webhookData.final === 1) {
      status = 'PAID';
    } else if (webhookData.status === 0 && webhookData.final === 0) {
      status = 'PENDING';
    } else {
      status = 'FAILED';
    }
    
    return {
      paymentId: webhookData.order_id || '',
      status,
      amount: webhookData.amount,
      currency: webhookData.currency,
    };
  }

  // Остановка всех таймеров при завершении работы сервиса
  stopAllStatusChecks(): void {
    console.log('🛑 Stopping all MasterCard status checks...');
    
    const timerCount = this.statusCheckTimers.size;
    for (const [paymentId] of this.statusCheckTimers) {
      this.clearStatusTimers(paymentId);
    }
    
    console.log(`🛑 Stopped ${timerCount} MasterCard status check timers`);
  }
}