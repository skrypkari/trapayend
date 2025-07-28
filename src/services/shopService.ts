import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { currencyService } from './currencyService';
import { PaymentService } from './paymentService';
import { CreatePaymentRequest, UpdatePaymentRequest, PaymentFilters } from '../types/payment';
import { UpdateShopProfileRequest, UpdateWalletsRequest, ShopProfileResponse } from '../types/shop';
import { PayoutFilters, PayoutStatistics, ShopPayoutStats, ShopPayoutResponse } from '../types/payout';
import { WebhookLogFilters } from '../types/webhook';

export class ShopService {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

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
      webhookUrl: shop.settings?.webhookUrl || null,
      webhookEvents,
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
      webhookUrl: updatedShop.settings?.webhookUrl || null,
      webhookEvents,
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
          },
        },
      },
    });

    if (!shop?.settings?.webhookUrl) {
      throw new Error('No webhook URL configured');
    }

    const testPayload = {
      event: 'test',
      payment: {
        id: 'test_payment_123',
        order_id: 'test_order_123',
        gateway: 'test',
        amount: 100,
        currency: 'USD',
        status: 'paid',
        created_at: new Date().toISOString(),
      },
    };

    try {
      const response = await fetch(shop.settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TesSoft Payment System/1.0 (Test)',
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

  async createPayment(paymentData: CreatePaymentRequest): Promise<any> {
    return this.paymentService.createPublicPayment({
      public_key: '', // Will be filled by the service
      gateway: paymentData.gateway,
      order_id: undefined,
      amount: paymentData.amount,
      currency: paymentData.currency,
      source_currency: paymentData.sourceCurrency,
      usage: paymentData.usage,
      expires_at: paymentData.expiresAt?.toISOString(),
      success_url: paymentData.redirectUrl,
      fail_url: paymentData.redirectUrl,
      customer_email: paymentData.customerEmail,
      customer_name: paymentData.customerName,
      country: paymentData.country,
      language: paymentData.language,
      amount_is_editable: paymentData.amountIsEditable,
      max_payments: paymentData.maxPayments,
      customer: paymentData.customer,
    });
  }

  async getPayments(shopId: string, filters: PaymentFilters): Promise<any> {
    return this.paymentService.getPaymentsByShop(shopId, filters);
  }

  async getPaymentById(shopId: string, paymentId: string): Promise<any> {
    return this.paymentService.getPaymentByShopAndId(shopId, paymentId);
  }

  async updatePayment(shopId: string, paymentId: string, updateData: UpdatePaymentRequest): Promise<any> {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        shopId,
      },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    return updatedPayment;
  }

  async deletePayment(shopId: string, paymentId: string): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        shopId,
      },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    await prisma.payment.delete({
      where: { id: paymentId },
    });
  }

  async getPayouts(shopId: string, filters: PayoutFilters): Promise<{
    payouts: ShopPayoutResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, status, method, dateFrom, dateTo, periodFrom, periodTo } = filters;
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    if (method) {
      where.network = method; // Using network field for method
    }

    // ✅ ОБНОВЛЕНО: Поддержка как dateFrom/dateTo, так и periodFrom/periodTo
    if (dateFrom || dateTo || periodFrom || periodTo) {
      where.createdAt = {};
      
      // Приоритет у periodFrom/periodTo, если они указаны
      if (periodFrom) {
        where.createdAt.gte = new Date(periodFrom);
      } else if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      
      if (periodTo) {
        where.createdAt.lte = new Date(periodTo);
      } else if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalPayouts,
      completedPayouts,
      pendingPayouts,
      rejectedPayouts,
      allPayouts,
      recentPayouts,
    ] = await Promise.all([
      prisma.payout.count({
        where: {
          shopId,
          createdAt: { gte: startDate },
        },
      }),
      prisma.payout.count({
        where: {
          shopId,
          status: 'COMPLETED',
          createdAt: { gte: startDate },
        },
      }),
      prisma.payout.count({
        where: {
          shopId,
          status: 'PENDING',
          createdAt: { gte: startDate },
        },
      }),
      prisma.payout.count({
        where: {
          shopId,
          status: 'REJECTED',
          createdAt: { gte: startDate },
        },
      }),
      prisma.payout.findMany({
        where: {
          shopId,
          createdAt: { gte: startDate },
        },
        select: {
          amount: true,
          status: true,
          network: true,
        },
      }),
      prisma.payout.findMany({
        where: { shopId },
        take: 10,
        orderBy: { createdAt: 'desc' },
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
    ]);

    const totalAmount = allPayouts.reduce((sum, payout) => sum + payout.amount, 0);
    const completedAmount = allPayouts
      .filter(payout => payout.status === 'COMPLETED')
      .reduce((sum, payout) => sum + payout.amount, 0);
    const pendingAmount = allPayouts
      .filter(payout => payout.status === 'PENDING')
      .reduce((sum, payout) => sum + payout.amount, 0);

    const payoutsByMethod = allPayouts.reduce((acc, payout) => {
      acc[payout.network] = (acc[payout.network] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const payoutsByStatus = allPayouts.reduce((acc, payout) => {
      acc[payout.status] = (acc[payout.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

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
      })),
    };
  }

  // ✅ ИСПРАВЛЕНО: Правильный расчет статистики выплат с учетом комиссий
  async getShopPayoutStats(shopId: string): Promise<ShopPayoutStats> {
    console.log(`📊 Calculating shop payout stats for shop ${shopId}...`);

    // ✅ НОВОЕ: Получаем магазин с новыми полями balance и totalPaidOut
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        username: true,
        balance: true,
        totalPaidOut: true,
      },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    // Получаем выплаты за текущий месяц
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const thisMonthStats = await prisma.payout.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        shopId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        status: 'COMPLETED',
      },
    });

    const thisMonth = thisMonthStats._sum.amount || 0;

    // ✅ НОВОЕ: Используем поля из базы данных напрямую
    const stats: ShopPayoutStats = {
      availableBalance: Math.round(shop.balance * 100) / 100,     // Текущий баланс (уже с учетом комиссии)
      totalPaidOut: Math.round(shop.totalPaidOut * 100) / 100,    // Общая сумма выплат
      awaitingPayout: Math.round(shop.balance * 100) / 100,       // Ожидает выплаты = текущий баланс
      thisMonth: Math.round(thisMonth * 100) / 100,               // Выплачено в этом месяце
    };

    console.log(`📊 Shop ${shop.username} payout statistics calculated:`);
    console.log(`   💵 Available balance: ${stats.availableBalance} USDT (current balance)`);
    console.log(`   💰 Total paid out: ${stats.totalPaidOut} USDT (total payouts)`);
    console.log(`   ⏳ Awaiting payout: ${stats.awaitingPayout} USDT (current balance)`);
    console.log(`   📅 This month: ${stats.thisMonth} USDT`);

    return stats;
  }

  // Helper method to get gateway display name
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

  // Legacy method for backward compatibility
  async getPayoutStats(shopId: string): Promise<any> {
    return this.getShopPayoutStats(shopId);
  }

  async getWebhookLogs(shopId: string, filters: WebhookLogFilters): Promise<{
    logs: any[];
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
        include: {
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

  async getStatistics(shopId: string, period: string): Promise<any> {
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalPayments,
      successfulPayments,
      totalRevenue,
      recentPayments,
      dailyPayments,
    ] = await Promise.all([
      prisma.payment.count({
        where: {
          shopId,
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
          createdAt: { gte: startDate },
        },
      }),
      prisma.payment.count({
        where: {
          shopId,
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
          status: 'PAID',
          createdAt: { gte: startDate },
        },
      }),
      prisma.payment.findMany({
        where: {
          shopId,
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
          status: 'PAID',
          createdAt: { gte: startDate },
        },
        select: {
          amount: true,
          currency: true,
          amountUSDT: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { 
          shopId,
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          gateway: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      // Get all payments for daily statistics
      prisma.payment.findMany({
        where: {
          shopId,
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
          createdAt: { gte: startDate },
        },
        select: {
          status: true,
          amountUSDT: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Calculate total revenue using amountUSDT for PAID payments
    let totalRevenueUSDT = 0;
    for (const payment of totalRevenue) {
      if (payment.amountUSDT) {
        totalRevenueUSDT += payment.amountUSDT;
      } else {
        // Fallback for old payments without amountUSDT
        const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
        totalRevenueUSDT += usdtAmount;
      }
    }

    // Generate daily statistics
    const dailyStats = this.generateDailyStatistics(dailyPayments, startDate, now);

    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return {
      totalPayments,
      successfulPayments,
      totalRevenue: Math.round(totalRevenueUSDT * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      dailyRevenue: dailyStats.dailyRevenue,
      dailyPayments: dailyStats.dailyPayments,
      recentPayments: recentPayments.map(payment => ({
        id: payment.id,
        gateway: payment.gateway,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
      })),
    };
  }

  // Helper method to generate daily statistics
  private generateDailyStatistics(payments: any[], startDate: Date, endDate: Date): {
    dailyRevenue: Array<{ date: string; amount: number }>;
    dailyPayments: Array<{ date: string; count: number }>;
  } {
    // Create a map for each day in the period
    const dailyData = new Map<string, { revenue: number; count: number }>();
    
    // Initialize all days in the period with zero values
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      dailyData.set(dateStr, { revenue: 0, count: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Process payments and group by date
    for (const payment of payments) {
      const paymentDate = payment.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD format
      const dayData = dailyData.get(paymentDate);
      
      if (dayData) {
        // Count all payments
        dayData.count += 1;
        
        // Add revenue only for PAID payments
        if (payment.status === 'PAID' && payment.amountUSDT) {
          dayData.revenue += payment.amountUSDT;
        }
      }
    }
    
    // Convert map to arrays
    const dailyRevenue: Array<{ date: string; amount: number }> = [];
    const dailyPayments: Array<{ date: string; count: number }> = [];
    
    for (const [date, data] of dailyData) {
      dailyRevenue.push({
        date,
        amount: Math.round(data.revenue * 100) / 100, // Round to 2 decimal places
      });
      
      dailyPayments.push({
        date,
        count: data.count,
      });
    }
    
    return { dailyRevenue, dailyPayments };
  }
}