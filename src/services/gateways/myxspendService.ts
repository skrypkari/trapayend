import { loggerService } from '../loggerService';

// ✅ НОВОЕ: MyXSpend Auth interfaces
export interface MyXSpendAuthRequest {
  email: string;
  password: string;
}

export interface MyXSpendAuthResponse {
  email: string;
  accountId: string;
  roles: string[];
  token: string;
  redirectPath: string;
}

// ✅ НОВОЕ: MyXSpend Payment interfaces
export interface MyXSpendPaymentRequest {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  firstName: string;
  lastName: string;
  customerOrderId: string;
  email: string;
  phone?: string;
  successUrl: string;
  failureUrl: string;
}

export interface MyXSpendPaymentResponse {
  gateway_payment_id: string;
  payment_url: string;
  paymentLinkCode?: string;
}

export interface MyXSpendApiResponse {
  country?: string;
  CreatedOn?: string;
  currency?: string;
  customerOrderId?: string;
  PaymentLink?: string;
  PaymentLinkCode?: string;
  responseCode?: string;
  responseMessage?: string;
  gateway_payment_id?: string;
  payment_url?: string;
}

export class MyXSpendService {
  private apiUrl: string;
  private authToken: string | null = null;
  private readonly API_KEY = 'EODO9BsIPsW4w3QTjkxN8uwCg9uDqb1pJ8XvxY1TjUhvQZYhCT';
  private readonly COMPANY_ID = '82dcbd4a-a838-47f9-ae21-8dac9a8f1622';

  constructor() {
    // Use white domain proxy server with unified payment file
    this.apiUrl = 'https://traffer.uk/gateway/myxspend/';
    
    console.log('🇲🇽 MyXSpend service initialized with unified payment processing');
  }

  async createPaymentLink(paymentData: MyXSpendPaymentRequest): Promise<MyXSpendPaymentResponse> {
    try {
      const {
        orderId,
        amount,
        currency,
        firstName,
        lastName,
        email,
        phone,
        successUrl,
        failureUrl,
      } = paymentData;

      console.log('🇲🇽 Creating MyXSpend payment link (unified)...');
      console.log('Order ID:', orderId);
      console.log('Amount:', amount, currency);
      console.log('Customer:', `${firstName} ${lastName}`);
      console.log('Email:', email);
      console.log('Phone:', phone || 'not provided');

      // Prepare request body for unified MyXSpend API
      const requestBody = {
        firstName,
        lastName,
        customerOrderId: orderId,
        email,
        phone: phone || '',
        amount,
        currency: currency.toUpperCase(),
        success_url: successUrl,
        failure_url: failureUrl
      };

      console.log('📤 MyXSpend unified request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.apiUrl}myxspend.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TrapayAPI/1.0'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log('📥 MyXSpend unified raw response:', responseText);

      if (!response.ok) {
        throw new Error(`MyXSpend API error: HTTP ${response.status} - ${responseText}`);
      }

      let result: MyXSpendApiResponse;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response from MyXSpend: ${responseText}`);
      }

      console.log('📊 MyXSpend unified response data:', JSON.stringify(result, null, 2));

      // Check if payment link was created successfully
      if (!result.PaymentLink && !result.payment_url) {
        throw new Error(`MyXSpend payment creation failed: ${result.responseMessage || 'Unknown error'}`);
      }

      const paymentLink = result.PaymentLink || result.payment_url;
      const paymentCode = result.PaymentLinkCode || result.gateway_payment_id;

      console.log('✅ MyXSpend unified payment link created successfully');
      console.log('Payment Link:', paymentLink);
      console.log('Payment Code:', paymentCode);
      console.log('Response Code:', result.responseCode);

      // Log the successful payment creation
      console.log('📝 Logging unified payment creation event...');

      return {
        gateway_payment_id: paymentCode || orderId,
        payment_url: paymentLink || '',
        paymentLinkCode: paymentCode
      };

    } catch (error) {
      console.error('❌ MyXSpend unified payment creation failed:', error);
      
      // Log the failed payment creation
      console.log('📝 Logging unified payment creation failure...');

      throw error;
    }
  }

  // ✅ НОВОЕ: Method to invalidate auth token (for retry logic)
  invalidateAuth(): void {
    this.authToken = null;
    console.log('🔐 MyXSpend auth token invalidated');
  }

  // ✅ НОВОЕ: Health check method
  async healthCheck(): Promise<boolean> {
    try {
      // For unified version, we don't need separate health check
      return true;
    } catch (error) {
      console.error('❌ MyXSpend health check failed:', error);
      return false;
    }
  }
}

export const myxspendService = new MyXSpendService();
