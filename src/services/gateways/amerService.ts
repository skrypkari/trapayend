import { loggerService } from '../loggerService';

export interface AmerPaymentLinkRequest {
  paymentId: string;
  orderId: string;
  orderName?: string;
  amount: number;
  currency: string;
  country: string;
  language?: string; 
  amountIsEditable?: boolean; 
  customer?: string;
  usage: 'ONCE' | 'REUSABLE';
  maxPayments?: number;
  successUrl: string;
  failUrl: string;
}

export interface AmerPaymentLinkResponse {
  gateway_payment_id: string;
  payment_url: string;
}

export interface AmerApiResponse {
  status: {
    error_code: string;
    status: string;
    message?: string;
    response_code?: string;
    operation_id?: string;
  };
  data?: {
    id?: string;
    redirect_url?: string;
    amount?: number;
    currency?: string;
    status?: string;
    [key: string]: any;
  };
}

export class AmerService {
  private apiUrl: string;

  constructor() {
    // Use api2.trapay.uk domain for Amer gateway
    this.apiUrl = 'https://api2.trapay.uk';
    
    console.log('🌐 Amer service initialized with api2.trapay.uk domain');
  }

  async createPaymentLink(paymentData: AmerPaymentLinkRequest): Promise<AmerPaymentLinkResponse> {
    const {
      paymentId,
      orderId,
      orderName,
      amount,
      currency,
      usage,
      maxPayments,
      successUrl,
      failUrl,
    } = paymentData;

    // Convert currency to uppercase
    const upperCurrency = currency.toUpperCase();

    console.log(`💳 Creating Amer payment link for order ${orderId}`);
    console.log(`💰 Amount: ${amount} ${upperCurrency}`);

    try {
      // For Amer, we create a payment URL pointing to payment.php on api2.trapay.uk
      // The payment processing will happen on that domain
      const paymentUrl = `${this.apiUrl}/payment.php?payment_id=${paymentId}&amount=${amount}&currency=${upperCurrency}&order=${orderId}`;

      console.log('=== AMER PAYMENT LINK CREATED ===');
      console.log('Payment ID:', paymentId);
      console.log('Payment URL:', paymentUrl);
      console.log('Amount:', amount, upperCurrency);

      // Log request
      loggerService.logWhiteDomainRequest('amer', '/payment', 'GET', {
        paymentId,
        amount,
        currency: upperCurrency,
        orderId
      });

      return {
        gateway_payment_id: paymentId,
        payment_url: paymentUrl,
      };

    } catch (error) {
      console.error('=== AMER SERVICE ERROR ===');
      console.error('Error details:', error);
      
      // Log service error
      loggerService.logWhiteDomainError('amer', '/payment', error);
      
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw new Error(`Failed to create Amer payment link: ${error.message}`);
      }
      
      throw new Error('Failed to create Amer payment link: Unknown error');
    }
  }

  async verifyPayment(gatewayPaymentId: string): Promise<{
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
  }> {
    // For Amer, payment status is updated via webhook/internal API
    // This method might not be needed, but we'll implement basic functionality
    console.log(`🔍 Verifying Amer payment: ${gatewayPaymentId}`);
    
    try {
      // Log request
      loggerService.logWhiteDomainRequest('amer', `/payment/verify/${gatewayPaymentId}`, 'GET', {});

      // Return pending status as verification happens via webhooks
      return {
        status: 'PENDING'
      };

    } catch (error) {
      console.error('Amer payment verification error:', error);
      loggerService.logWhiteDomainError('amer', `/payment/verify/${gatewayPaymentId}`, error);
      throw new Error(`Failed to verify Amer payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Process webhook/update from api2.trapay.uk
  async processWebhook(webhookData: any): Promise<{
    paymentId: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
    additionalInfo?: {
      cardLast4?: string;
      paymentMethod?: string;
      gatewayPaymentId?: string;
      transactionId?: string;
    };
  }> {
    console.log('Processing Amer webhook:', webhookData);
    
    let status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' = 'PENDING';
    
    // Map Amer status to our status
    if (webhookData.success === true) {
      status = 'PAID';
    } else if (webhookData.success === false) {
      status = 'FAILED';
    }
    
    // Extract additional info
    const additionalInfo: any = {};
    
    if (webhookData.cardLast4) {
      additionalInfo.cardLast4 = webhookData.cardLast4;
    }
    
    if (webhookData.paymentMethod) {
      additionalInfo.paymentMethod = webhookData.paymentMethod;
    }
    
    if (webhookData.transactionId) {
      additionalInfo.transactionId = webhookData.transactionId;
      additionalInfo.gatewayPaymentId = webhookData.transactionId;
    }
    
    console.log(`🔄 Amer webhook processed: status=${status}`);
    
    return {
      paymentId: webhookData.paymentId || webhookData.orderId || '',
      status,
      amount: webhookData.amount,
      currency: webhookData.currency,
      additionalInfo,
    };
  }
}
