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

export interface AmerGatewaySettings {
  enabled: boolean;
  commission: number;
  customer: string;  // Customer ID для payment_backend.php
  co: string;        // Company code
  product: string;   // Product code
  country?: string;  // Default country
}

export interface AmerWebhookData {
  paymentId: string;
  orderId: string;
  success: boolean;
  amount?: number;
  currency?: string;
  transactionId?: string;
  cardLast4?: string;
  paymentMethod?: string;
  errorMessage?: string;
}

export interface AmerPaymentData {
  amount: number;
  currency: string;
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export interface Amer3DSChallenge {
  requires_3ds: boolean;
  requires_ddc?: boolean;
  ddc_url?: string;
  ddc_params?: {
    url: string;
    jwt: string;
    bin: string;
    refid: string;
  };
  challenge_url?: string;
  challenge_data?: any;
  transaction_id: string;
}
