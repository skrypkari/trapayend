export interface TestGatewayCardData {
  cardNumber: string;
  cardHolderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvc: string;
}

export interface TestGatewayPaymentRequest {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  cardData: TestGatewayCardData;
}

export interface TestGatewayPaymentResponse {
  success: boolean;
  status: 'PAID' | 'FAILED';
  message: string;
  transactionId?: string;
  failureReason?: string;
}

export class TestGatewayService {
  private readonly SUCCESS_CARD = '4242424242424242';

  constructor() {
    console.log('🧪 Test Gateway service initialized');
  }

  async processCardPayment(paymentData: TestGatewayPaymentRequest): Promise<TestGatewayPaymentResponse> {
    const { paymentId, orderId, amount, currency, cardData } = paymentData;

    console.log('=== TEST GATEWAY CARD PROCESSING ===');
    console.log('Payment ID:', paymentId);
    console.log('Order ID:', orderId);
    console.log('Amount:', amount, currency);
    console.log('Card Number:', this.maskCardNumber(cardData.cardNumber));
    console.log('Card Holder:', cardData.cardHolderName);
    console.log('Expiry:', `${cardData.expiryMonth}/${cardData.expiryYear}`);
    console.log('CVC:', '***');

    // Validate card data
    const validationResult = this.validateCardData(cardData);
    if (!validationResult.isValid) {
      console.log('❌ Card validation failed:', validationResult.error);
      return {
        success: false,
        status: 'FAILED',
        message: 'Card validation failed',
        failureReason: validationResult.error,
      };
    }

    // Clean card number (remove spaces and dashes)
    const cleanCardNumber = cardData.cardNumber.replace(/[\s-]/g, '');

    // Check if it's the success card
    if (cleanCardNumber === this.SUCCESS_CARD) {
      const transactionId = this.generateTransactionId();
      
      console.log('✅ Test payment successful');
      console.log('Transaction ID:', transactionId);

      return {
        success: true,
        status: 'PAID',
        message: 'Payment processed successfully',
        transactionId,
      };
    } else {
      console.log('❌ Test payment failed - invalid card number');
      
      return {
        success: false,
        status: 'FAILED',
        message: 'Payment failed',
        failureReason: 'Card declined - insufficient funds or invalid card',
      };
    }
  }

  private validateCardData(cardData: TestGatewayCardData): { isValid: boolean; error?: string } {
    // Validate card number
    const cleanCardNumber = cardData.cardNumber.replace(/[\s-]/g, '');
    if (!/^\d{16}$/.test(cleanCardNumber)) {
      return { isValid: false, error: 'Card number must be 16 digits' };
    }

    // Validate card holder name
    if (!cardData.cardHolderName || cardData.cardHolderName.trim().length < 2) {
      return { isValid: false, error: 'Card holder name is required' };
    }

    // Validate expiry month
    const month = parseInt(cardData.expiryMonth);
    if (isNaN(month) || month < 1 || month > 12) {
      return { isValid: false, error: 'Invalid expiry month' };
    }

    // Validate expiry year
    const year = parseInt(cardData.expiryYear);
    const currentYear = new Date().getFullYear();
    const fullYear = year < 50 ? 2000 + year : 1900 + year; // Handle YY format: 00-49 = 20xx, 50-99 = 19xx
    if (isNaN(year) || fullYear < currentYear || fullYear > currentYear + 20) {
      return { isValid: false, error: 'Invalid expiry year' };
    }

    // Validate CVC
    if (!/^\d{3,4}$/.test(cardData.cvc)) {
      return { isValid: false, error: 'CVC must be 3 or 4 digits' };
    }

    return { isValid: true };
  }

  private maskCardNumber(cardNumber: string): string {
    const clean = cardNumber.replace(/[\s-]/g, '');
    if (clean.length < 4) return '****';
    return '**** **** **** ' + clean.slice(-4);
  }

  private generateTransactionId(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `test_${timestamp}_${random}`;
  }

  // Method for processing webhook (not used for test gateway, but kept for consistency)
  async processWebhook(webhookData: any): Promise<{
    paymentId: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
    amount?: number;
    currency?: string;
  }> {
    console.log('Processing Test Gateway webhook (not typically used):', webhookData);
    
    return {
      paymentId: webhookData.order_id || '',
      status: webhookData.status === 'success' ? 'PAID' : 'FAILED',
      amount: webhookData.amount,
      currency: webhookData.currency,
    };
  }
}