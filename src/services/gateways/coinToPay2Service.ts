import { loggerService } from '../loggerService';

export interface CoinToPay2PaymentLinkRequest {
  paymentId: string;
  orderId: string;
  amount: number; // Always in EUR
}

export interface CoinToPay2PaymentLinkResponse {
  gateway_payment_id: string;
  payment_url: string;
}

export interface CoinToPay2ApiResponse {
  gateway_payment_id?: string;
  payment_url?: string;
  status?: string;
  amount?: number;
  currency?: string;
  // Error response
  error?: string;
  message?: string;
}

// Interface for status check response
export interface CoinToPay2StatusResponse {
  result: string;
  status_code: number;
  message: string;
  data: {
    MerchantID: string;
    AltCoinID: number;
    TransactionID: string;
    coinAddress: string;
    CustomerReferenceNr: string;
    SecurityCode: string;
    inputCurrency: string;
    Security: string;
    Amount: string;
    OriginalAmount: string;
    CoinName: string;
    QRCodeURL: string;
    RedirectURL: string;
    shortURL: string;
    MinerFee: string;
    ExpiryTime: number;
    TZERO: string;
    RedirectTargetURL: string;
    Status: string; // "waiting", "Awaiting Fiat", "Paid", "expired", "failed", etc.
    CreatedOn: string;
    TransactionConfirmedOn: string | null;
    ShopTitle: string;
    ConfirmURL: string | null;
    FailURL: string | null;
    PaymentDetail: string; // Contains IBAN and bank details
    PaymentDetailCConly: string | null;
    LongName: string;
    LTR: number;
    ExpiredDate: string;
    Reopenable: number;
    MasterTransactionID: number;
    Buy: number;
    Tag: string;
    NotEnough: number;
    PaymentOptions: any;
    SupportedCoins: any;
    Transactions: any;
    error: any;
    success: number;
    result: any;
  };
}

export class CoinToPay2Service {
  private apiUrl: string;
  private statusUrl: string;

  constructor() {
    // ✅ НОВОЕ: Используем traffer.uk вместо tesoft.uk
    this.apiUrl = 'https://traffer.uk/gateway/cointopay/';
    this.statusUrl = 'https://traffer.uk/gateway/cointopay/status.php';
    
    console.log('🪙 CoinToPay2 service initialized with traffer.uk proxy');
    console.log('📊 Status check URL:', this.statusUrl);
  }

  async createPaymentLink(paymentData: CoinToPay2PaymentLinkRequest): Promise<CoinToPay2PaymentLinkResponse> {
    const {
      orderId,
      amount,
    } = paymentData;

    console.log(`🪙 Creating CoinToPay2 payment: ${amount} EUR`);

    // Prepare request body for CoinToPay2 - only amount needed
    const requestBody = {
      amount: amount, // Always in EUR
    };

    const startTime = Date.now();

    try {
      console.log('=== COINTOPAY2 API REQUEST (traffer.uk) ===');
      console.log('URL:', this.apiUrl);
      console.log('Request Body:', JSON.stringify(requestBody, null, 2));
      console.log('Amount:', amount, 'EUR (always EUR for CoinToPay2)');

      // Log request to white domain
      loggerService.logWhiteDomainRequest('cointopay2', '/create', 'POST', requestBody);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (CoinToPay2)',
        },
        body: JSON.stringify(requestBody),
      });

      const responseTime = Date.now() - startTime;

      console.log('=== COINTOPAY2 API RESPONSE (traffer.uk) ===');
      console.log('Status:', response.status);
      console.log('Status Text:', response.statusText);
      console.log('Headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response Time:', responseTime + 'ms');

      const responseText = await response.text();
      console.log('Raw Response Body:', responseText);

      if (!response.ok) {
        console.error('=== COINTOPAY2 API ERROR ===');
        console.error('HTTP Status:', response.status);
        console.error('Response Body:', responseText);
        
        // Log error response
        loggerService.logWhiteDomainResponse('cointopay2', '/create', response.status, responseText, responseTime);
        loggerService.logWhiteDomainError('cointopay2', '/create', `HTTP ${response.status}: ${responseText}`);
        
        throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
      }

      let result: CoinToPay2ApiResponse;
      try {
        result = JSON.parse(responseText) as CoinToPay2ApiResponse;
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        
        // Log parse error
        loggerService.logWhiteDomainError('cointopay2', '/create', `JSON Parse Error: ${parseError}`);
        
        throw new Error(`Invalid JSON response from CoinToPay2 API: ${responseText}`);
      }

      console.log('=== PARSED COINTOPAY2 RESPONSE ===');
      console.log('Parsed Result:', JSON.stringify(result, null, 2));

      // Log successful response
      loggerService.logWhiteDomainResponse('cointopay2', '/create', response.status, result, responseTime);

      // Check for error in response
      if (result.error) {
        const errorMessage = result.message || result.error || 'Unknown error from CoinToPay2 API';
        console.error('=== COINTOPAY2 API BUSINESS ERROR ===');
        console.error('Error Message:', errorMessage);
        
        // Log business error
        loggerService.logWhiteDomainError('cointopay2', '/create', `Business Error: ${errorMessage}`);
        
        throw new Error(`CoinToPay2 API error: ${errorMessage}`);
      }

      if (!result.payment_url || !result.gateway_payment_id) {
        console.error('=== COINTOPAY2 API INCOMPLETE RESPONSE ===');
        console.error('Missing payment_url or gateway_payment_id in response');
        console.error('Response data:', result);
        
        // Log incomplete response error
        loggerService.logWhiteDomainError('cointopay2', '/create', 'Incomplete response: missing payment_url or gateway_payment_id');
        
        throw new Error('Invalid response from CoinToPay2 API: missing payment_url or gateway_payment_id');
      }

      console.log('=== COINTOPAY2 SUCCESS ===');
      console.log('Gateway Payment ID:', result.gateway_payment_id);
      console.log('Payment URL:', result.payment_url);
      console.log('Amount:', amount, 'EUR');

      return {
        gateway_payment_id: result.gateway_payment_id,
        payment_url: result.payment_url,
      };

    } catch (error) {
      console.error('=== COINTOPAY2 SERVICE ERROR ===');
      console.error('Error details:', error);
      
      // Log service error
      loggerService.logWhiteDomainError('cointopay2', '/create', error);
      
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw new Error(`Failed to create CoinToPay2 payment link: ${error.message}`);
      }
      
      throw new Error('Failed to create CoinToPay2 payment link: Unknown error');
    }
  }

  // Check payment status
  async checkPaymentStatus(gatewayPaymentId: string): Promise<{
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
    paymentDetails?: {
      iban?: string;
      bankDetails?: string;
      transactionId?: string;
      coinAddress?: string;
      qrCodeUrl?: string;
      expiryTime?: number;
      createdOn?: string;
      confirmedOn?: string | null;
    };
  }> {
    const startTime = Date.now();

    try {
      console.log(`📊 Checking CoinToPay2 payment status for: ${gatewayPaymentId}`);

      // Prepare request body with only gatewayPaymentId
      const requestBody = {
        gatewayPaymentId: gatewayPaymentId,
      };

      // Log request
      loggerService.logWhiteDomainRequest('cointopay2', '/status', 'POST', requestBody);

      const response = await fetch(this.statusUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (CoinToPay2)',
        },
        body: JSON.stringify(requestBody),
      });

      const responseTime = Date.now() - startTime;

      console.log('=== COINTOPAY2 STATUS CHECK RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Response Time:', responseTime + 'ms');

      if (!response.ok) {
        const responseText = await response.text();
        console.error('HTTP Status:', response.status);
        console.error('Response Body:', responseText);
        
        loggerService.logWhiteDomainResponse('cointopay2', '/status', response.status, responseText, responseTime);
        loggerService.logWhiteDomainError('cointopay2', '/status', `HTTP ${response.status}: ${responseText}`);
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      console.log('Raw Response Body:', responseText);

      let result: CoinToPay2StatusResponse;
      try {
        result = JSON.parse(responseText) as CoinToPay2StatusResponse;
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        
        loggerService.logWhiteDomainError('cointopay2', '/status', `JSON Parse Error: ${parseError}`);
        
        throw new Error(`Invalid JSON response from CoinToPay2 status API: ${responseText}`);
      }

      // Log successful response
      loggerService.logWhiteDomainResponse('cointopay2', '/status', response.status, result, responseTime);

      console.log('=== PARSED COINTOPAY2 STATUS RESPONSE ===');
      console.log('Result:', result.result);
      console.log('Status Code:', result.status_code);
      console.log('Payment Status:', result.data?.Status);
      console.log('Amount:', result.data?.Amount);
      console.log('Currency:', result.data?.inputCurrency);

      // Check for error in response
      if (result.result !== 'success' || result.status_code !== 200) {
        const errorMessage = result.message || 'Unknown error from CoinToPay2 status API';
        console.error('=== COINTOPAY2 STATUS API ERROR ===');
        console.error('Error Message:', errorMessage);
        
        loggerService.logWhiteDomainError('cointopay2', '/status', `Status API Error: ${errorMessage}`);
        
        throw new Error(`CoinToPay2 status API error: ${errorMessage}`);
      }

      if (!result.data) {
        console.error('=== COINTOPAY2 STATUS API INCOMPLETE RESPONSE ===');
        console.error('Missing data in response');
        
        loggerService.logWhiteDomainError('cointopay2', '/status', 'Incomplete response: missing data');
        
        throw new Error('Invalid response from CoinToPay2 status API: missing data');
      }

      // Status mapping - только "Paid" считается PAID
      let status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' = 'PENDING';
      
      switch (result.data.Status?.toLowerCase()) {
        case 'paid': // Только "Paid" считается успешным
          status = 'PAID';
          break;
        case 'cancelled':
        case 'failed':
        case 'error':
          status = 'FAILED';
          break;
        case 'expired':
        case 'timeout':
          status = 'EXPIRED';
          break;
        case 'waiting':
        case 'awaiting fiat': // "Awaiting Fiat" остается PENDING
        case 'pending':
        case 'created':
        default:
          status = 'PENDING';
          break;
      }

      // Extract IBAN and bank details from PaymentDetail
      let iban: string | undefined;
      let bankDetails: string | undefined;

      if (result.data.PaymentDetail) {
        const paymentDetail = result.data.PaymentDetail;
        console.log('🏦 Payment Detail:', paymentDetail);

        // ✅ ИСПРАВЛЕНО: Улучшенное извлечение IBAN с поддержкой HTML формата
        // Ищем IBAN в разных форматах:
        // 1. HTML формат: <span>IBAN</span>&nbsp;LU834080000056593963
        // 2. Простой формат: IBAN LU834080000056593963
        // 3. Формат с двоеточием: IBAN: LU834080000056593963
        const ibanPatterns = [
          /<span[^>]*>IBAN<\/span>&nbsp;([A-Z]{2}[0-9]{2}[A-Z0-9]+)/i,  // HTML формат
          /IBAN[:\s]+([A-Z]{2}[0-9]{2}[A-Z0-9]+)/i,                     // Простой формат с двоеточием или пробелом
          /IBAN\s+([A-Z]{2}[0-9]{2}[A-Z0-9]+)/i                        // Оригинальный формат
        ];

        for (const pattern of ibanPatterns) {
          const ibanMatch = paymentDetail.match(pattern);
          if (ibanMatch) {
            iban = ibanMatch[1];
            console.log('🏦 Extracted IBAN:', iban, 'using pattern:', pattern.source);
            break;
          }
        }

        if (!iban) {
          console.log('⚠️ IBAN not found in payment details. Trying to extract from text...');
          // Fallback: поиск любого IBAN-подобного кода в тексте (2 буквы + 2 цифры + буквы/цифры)
          const fallbackMatch = paymentDetail.match(/\b([A-Z]{2}[0-9]{2}[A-Z0-9]{10,})\b/i);
          if (fallbackMatch) {
            iban = fallbackMatch[1];
            console.log('🏦 Extracted IBAN via fallback:', iban);
          }
        }

        // Store full bank details
        bankDetails = paymentDetail;
      }

      const paymentDetails = {
        iban,
        bankDetails,
        transactionId: result.data.TransactionID,
        coinAddress: result.data.coinAddress,
        qrCodeUrl: result.data.QRCodeURL,
        expiryTime: result.data.ExpiryTime,
        createdOn: result.data.CreatedOn,
        confirmedOn: result.data.TransactionConfirmedOn,
      };

      console.log('=== COINTOPAY2 STATUS SUCCESS ===');
      console.log('Status:', result.data.Status, '->', status);
      console.log('Amount:', result.data.Amount, result.data.inputCurrency);
      console.log('Transaction ID:', result.data.TransactionID);
      console.log('IBAN:', iban || 'not found');
      console.log('Created On:', result.data.CreatedOn);
      console.log('Confirmed On:', result.data.TransactionConfirmedOn || 'not confirmed');

      // Log specific status mapping
      if (result.data.Status?.toLowerCase() === 'awaiting fiat') {
        console.log('💡 "Awaiting Fiat" mapped to PENDING (not PAID)');
      } else if (result.data.Status?.toLowerCase() === 'paid') {
        console.log('✅ "Paid" mapped to PAID');
      }

      return {
        status,
        amount: parseFloat(result.data.Amount) || undefined,
        currency: result.data.inputCurrency || 'EUR',
        paymentDetails,
      };

    } catch (error) {
      console.error('CoinToPay2 payment status check error:', error);
      loggerService.logWhiteDomainError('cointopay2', '/status', error);
      throw new Error(`Failed to check CoinToPay2 payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyPayment(gatewayPaymentId: string): Promise<{
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
  }> {
    // Use the new status check method
    const statusResult = await this.checkPaymentStatus(gatewayPaymentId);
    
    return {
      status: statusResult.status,
      amount: statusResult.amount,
      currency: statusResult.currency,
    };
  }

  // Method for processing webhook from CoinToPay2 (kept for compatibility, but not used)
  async processWebhook(webhookData: any): Promise<{
    paymentId: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
  }> {
    console.log('Processing CoinToPay2 webhook (deprecated - use status check instead):', webhookData);
    
    // Status mapping for webhook (if ever used)
    let status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' = 'PENDING';
    
    switch (webhookData.status?.toLowerCase()) {
      case 'paid': // Только "paid" считается успешным
        status = 'PAID';
        break;
      case 'cancelled':
      case 'failed':
      case 'error':
        status = 'FAILED';
        break;
      case 'expired':
      case 'timeout':
        status = 'EXPIRED';
        break;
      case 'pending':
      case 'waiting':
      case 'awaiting fiat': // "Awaiting Fiat" остается PENDING
      case 'created':
      default:
        status = 'PENDING';
        break;
    }
    
    return {
      paymentId: webhookData.order_id || webhookData.merchant_reference_id || '',
      status,
      amount: webhookData.amount,
      currency: webhookData.currency || 'EUR',
    };
  }
}
