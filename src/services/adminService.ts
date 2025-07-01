import prisma from '../config/database';
import { currencyService } from './currencyService';
import { 
  MerchantsAwaitingPayoutFilters, 
  MerchantAwaitingPayout, 
  CreatePayoutRequest, 
  PayoutResponse, 
  PayoutFilters,
  MerchantStatisticsFilters,
  MerchantStatistics
} from '../types/admin';
import { UpdateUserRequest, CreateUserRequest, UserResponse } from '../types/user';
import { UpdateCustomerDataRequest } from '../types/payment'; // ✅ НОВОЕ: Импорт типа
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class AdminService {
  // Get system statistics
  async getSystemStatistics(period: string): Promise<any> {
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

    const [
      totalShops,
      activeShops,
      totalPayments,
      successfulPayments,
      totalRevenue,
      totalPayouts,
      recentPayments,
    ] = await Promise.all([
      prisma.shop.count(),
      prisma.shop.count({ where: { status: 'ACTIVE' } }),
      prisma.payment.count({ where: { createdAt: { gte: startDate } } }),
      prisma.payment.count({ 
        where: { 
          status: 'PAID',
          createdAt: { gte: startDate }
        } 
      }),
      this.calculateTotalRevenue(startDate),
      this.calculateTotalPayouts(startDate),
      prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: {
            select: { name: true, username: true },
          },
        },
      }),
    ]);

    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return {
      overview: {
        totalShops,
        activeShops,
        totalPayments,
        successfulPayments,
        conversionRate: Math.round(conversionRate * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPayouts: Math.round(totalPayouts * 100) / 100,
      },
      recentPayments: recentPayments.map(payment => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gateway: payment.gateway,
        shop: payment.shop,
        createdAt: payment.createdAt,
      })),
    };
  }

  // ✅ ДОБАВЛЕНО: Merchant statistics with filters
  async getMerchantStatistics(filters: MerchantStatisticsFilters): Promise<MerchantStatistics> {
    console.log('📊 Getting merchant statistics with filters:', filters);

    // Определяем период
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (filters.period === 'custom' && filters.dateFrom && filters.dateTo) {
      startDate = new Date(filters.dateFrom);
      endDate = new Date(filters.dateTo);
    } else {
      switch (filters.period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
        default:
          startDate = new Date('2020-01-01'); // Начало времен
          break;
      }
    }

    console.log(`📊 Period: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    // Базовый фильтр по времени
    const baseWhere: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Добавляем фильтр по мерчанту если указан
    if (filters.shopId) {
      baseWhere.shopId = filters.shopId;
    }

    // Получаем все платежи за период
    const payments = await prisma.payment.findMany({
      where: baseWhere,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            username: true,
            gatewaySettings: true,
          },
        },
      },
    });

    console.log(`📊 Found ${payments.length} payments for analysis`);

    // Инициализируем метрики
    let totalTurnover = 0;
    let merchantEarnings = 0;
    let gatewayEarnings = 0;
    let totalPaidOut = 0;
    let totalPayments = payments.length;
    let successfulPayments = 0;

    // Группировка по шлюзам
    const gatewayStats: Record<string, {
      paymentsCount: number;
      turnoverUSDT: number;
      commissionUSDT: number;
      merchantEarningsUSDT: number;
      commissionRates: number[];
    }> = {};

    // Группировка по мерчантам (если не выбран конкретный)
    const merchantStats: Record<string, {
      shopId: string;
      shopName: string;
      shopUsername: string;
      paymentsCount: number;
      turnoverUSDT: number;
      commissionUSDT: number;
      merchantEarningsUSDT: number;
    }> = {};

    // Обрабатываем каждый платеж
    for (const payment of payments) {
      if (payment.status === 'PAID') {
        successfulPayments++;

        // Конвертируем в USDT
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        totalTurnover += amountUSDT;

        // Получаем настройки комиссии для шлюза
        let commissionRate = 10; // По умолчанию 10%
        
        if (payment.shop.gatewaySettings) {
          try {
            const settings = JSON.parse(payment.shop.gatewaySettings);
            const gatewayDisplayName = this.getGatewayDisplayName(payment.gateway);
            
            if (settings[gatewayDisplayName]?.commission !== undefined) {
              commissionRate = settings[gatewayDisplayName].commission;
            }
          } catch (error) {
            console.error('Error parsing gateway settings:', error);
          }
        }

        const commissionUSDT = amountUSDT * (commissionRate / 100);
        const merchantEarningUSDT = amountUSDT - commissionUSDT;

        merchantEarnings += merchantEarningUSDT;
        gatewayEarnings += commissionUSDT;

        // Статистика по шлюзам
        if (!gatewayStats[payment.gateway]) {
          gatewayStats[payment.gateway] = {
            paymentsCount: 0,
            turnoverUSDT: 0,
            commissionUSDT: 0,
            merchantEarningsUSDT: 0,
            commissionRates: [],
          };
        }

        gatewayStats[payment.gateway].paymentsCount++;
        gatewayStats[payment.gateway].turnoverUSDT += amountUSDT;
        gatewayStats[payment.gateway].commissionUSDT += commissionUSDT;
        gatewayStats[payment.gateway].merchantEarningsUSDT += merchantEarningUSDT;
        gatewayStats[payment.gateway].commissionRates.push(commissionRate);

        // Статистика по мерчантам (только если не выбран конкретный мерчант)
        if (!filters.shopId) {
          if (!merchantStats[payment.shopId]) {
            merchantStats[payment.shopId] = {
              shopId: payment.shopId,
              shopName: payment.shop.name,
              shopUsername: payment.shop.username,
              paymentsCount: 0,
              turnoverUSDT: 0,
              commissionUSDT: 0,
              merchantEarningsUSDT: 0,
            };
          }

          merchantStats[payment.shopId].paymentsCount++;
          merchantStats[payment.shopId].turnoverUSDT += amountUSDT;
          merchantStats[payment.shopId].commissionUSDT += commissionUSDT;
          merchantStats[payment.shopId].merchantEarningsUSDT += merchantEarningUSDT;
        }
      }
    }

    // Получаем выплаты за период
    const payoutsWhere: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (filters.shopId) {
      payoutsWhere.shopId = filters.shopId;
    }

    const payouts = await prisma.payout.findMany({
      where: payoutsWhere,
    });

    for (const payout of payouts) {
      totalPaidOut += payout.amount; // Уже в USDT
    }

    // Средний чек
    const averageCheck = successfulPayments > 0 ? totalTurnover / successfulPayments : 0;

    // Конверсия
    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    // Формируем разбивку по шлюзам
    const gatewayBreakdown = Object.entries(gatewayStats).map(([gateway, stats]) => ({
      gateway,
      gatewayDisplayName: this.getGatewayDisplayName(gateway),
      paymentsCount: stats.paymentsCount,
      turnoverUSDT: Math.round(stats.turnoverUSDT * 100) / 100,
      commissionUSDT: Math.round(stats.commissionUSDT * 100) / 100,
      merchantEarningsUSDT: Math.round(stats.merchantEarningsUSDT * 100) / 100,
      averageCommissionRate: stats.commissionRates.length > 0 
        ? Math.round((stats.commissionRates.reduce((a, b) => a + b, 0) / stats.commissionRates.length) * 100) / 100
        : 10,
    }));

    // Формируем разбивку по мерчантам (только если не выбран конкретный)
    let merchantBreakdown: any[] | undefined;
    if (!filters.shopId) {
      merchantBreakdown = Object.values(merchantStats).map(stats => {
        // Получаем выплаты для этого мерчанта
        const merchantPayouts = payouts.filter(p => p.shopId === stats.shopId);
        const paidOutUSDT = merchantPayouts.reduce((sum, p) => sum + p.amount, 0);
        
        return {
          ...stats,
          turnoverUSDT: Math.round(stats.turnoverUSDT * 100) / 100,
          commissionUSDT: Math.round(stats.commissionUSDT * 100) / 100,
          merchantEarningsUSDT: Math.round(stats.merchantEarningsUSDT * 100) / 100,
          paidOutUSDT: Math.round(paidOutUSDT * 100) / 100,
          averageCheckUSDT: stats.paymentsCount > 0 
            ? Math.round((stats.turnoverUSDT / stats.paymentsCount) * 100) / 100 
            : 0,
        };
      });
    }

    // Генерируем дневные данные для графиков
    const dailyData = await this.generateDailyData(startDate, endDate, filters.shopId);

    const result: MerchantStatistics = {
      totalTurnover: Math.round(totalTurnover * 100) / 100,
      merchantEarnings: Math.round(merchantEarnings * 100) / 100,
      gatewayEarnings: Math.round(gatewayEarnings * 100) / 100,
      totalPaidOut: Math.round(totalPaidOut * 100) / 100,
      averageCheck: Math.round(averageCheck * 100) / 100,
      totalPayments,
      successfulPayments,
      conversionRate: Math.round(conversionRate * 100) / 100,
      gatewayBreakdown,
      merchantBreakdown,
      dailyData,
      periodInfo: {
        from: startDate,
        to: endDate,
        periodType: filters.period || 'month',
        daysCount: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
    };

    console.log('📊 Merchant statistics calculated:', {
      totalTurnover: result.totalTurnover,
      merchantEarnings: result.merchantEarnings,
      gatewayEarnings: result.gatewayEarnings,
      totalPayments: result.totalPayments,
      successfulPayments: result.successfulPayments,
    });

    return result;
  }

  private async generateDailyData(startDate: Date, endDate: Date, shopId?: string): Promise<any[]> {
    const dailyData: any[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const whereClause: any = {
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: 'PAID',
      };

      if (shopId) {
        whereClause.shopId = shopId;
      }

      const dayPayments = await prisma.payment.findMany({
        where: whereClause,
        include: {
          shop: {
            select: {
              gatewaySettings: true,
            },
          },
        },
      });

      let dayTurnover = 0;
      let dayMerchantEarnings = 0;
      let dayGatewayEarnings = 0;

      for (const payment of dayPayments) {
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        dayTurnover += amountUSDT;

        // Получаем комиссию
        let commissionRate = 10;
        if (payment.shop.gatewaySettings) {
          try {
            const settings = JSON.parse(payment.shop.gatewaySettings);
            const gatewayDisplayName = this.getGatewayDisplayName(payment.gateway);
            
            if (settings[gatewayDisplayName]?.commission !== undefined) {
              commissionRate = settings[gatewayDisplayName].commission;
            }
          } catch (error) {
            // Используем значение по умолчанию
          }
        }

        const commissionUSDT = amountUSDT * (commissionRate / 100);
        const merchantEarningUSDT = amountUSDT - commissionUSDT;

        dayMerchantEarnings += merchantEarningUSDT;
        dayGatewayEarnings += commissionUSDT;
      }

      dailyData.push({
        date: currentDate.toISOString().split('T')[0],
        turnover: Math.round(dayTurnover * 100) / 100,
        merchantEarnings: Math.round(dayMerchantEarnings * 100) / 100,
        gatewayEarnings: Math.round(dayGatewayEarnings * 100) / 100,
        paymentsCount: dayPayments.length,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyData;
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

  // Get payout statistics
  async getPayoutStats(): Promise<any> {
    const [
      totalPayouts,
      completedPayouts,
      pendingPayouts,
      totalAmount,
      completedAmount,
    ] = await Promise.all([
      prisma.payout.count(),
      prisma.payout.count({ where: { status: 'COMPLETED' } }),
      prisma.payout.count({ where: { status: 'PENDING' } }),
      this.calculateTotalPayoutAmount(),
      this.calculateCompletedPayoutAmount(),
    ]);

    return {
      totalPayouts,
      completedPayouts,
      pendingPayouts,
      rejectedPayouts: totalPayouts - completedPayouts - pendingPayouts,
      totalAmount: Math.round(totalAmount * 100) / 100,
      completedAmount: Math.round(completedAmount * 100) / 100,
      pendingAmount: Math.round((totalAmount - completedAmount) * 100) / 100,
    };
  }

  // Get merchants awaiting payout
  async getMerchantsAwaitingPayout(filters: MerchantsAwaitingPayoutFilters): Promise<{
    merchants: MerchantAwaitingPayout[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary: {
      totalMerchants: number;
      totalAmountUSDT: number;
      totalAmountAfterCommissionUSDT: number;
    };
  }> {
    console.log('💰 Getting merchants awaiting payout with filters:', filters);

    // Получаем всех мерчантов с неоплаченными платежами
    const merchantsWithPayments = await prisma.shop.findMany({
      where: {
        payments: {
          some: {
            status: 'PAID',
            merchantPaid: false,
            paidAt: { not: null },
          },
        },
        ...(filters.search ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { username: { contains: filters.search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        payments: {
          where: {
            status: 'PAID',
            merchantPaid: false,
            paidAt: { not: null },
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            gateway: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    console.log(`💰 Found ${merchantsWithPayments.length} merchants with unpaid payments`);

    // Обрабатываем каждого мерчанта
    const merchantsData: MerchantAwaitingPayout[] = [];

    for (const merchant of merchantsWithPayments) {
      let totalAmountUSDT = 0;
      let totalAmountAfterCommissionUSDT = 0;
      const gatewayBreakdown: Record<string, {
        count: number;
        amountUSDT: number;
        amountAfterCommissionUSDT: number;
        commission: number;
      }> = {};

      // Получаем настройки шлюзов мерчанта
      let gatewaySettings: Record<string, any> = {};
      if (merchant.gatewaySettings) {
        try {
          gatewaySettings = JSON.parse(merchant.gatewaySettings);
        } catch (error) {
          console.error('Error parsing gateway settings for merchant:', merchant.username, error);
        }
      }

      let oldestPaymentDate = new Date();

      // Обрабатываем каждый платеж
      for (const payment of merchant.payments) {
        // Конвертируем в USDT
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        totalAmountUSDT += amountUSDT;

        // Получаем комиссию для шлюза
        const gatewayDisplayName = this.getGatewayDisplayName(payment.gateway);
        let commission = 10; // По умолчанию 10%

        if (gatewaySettings[gatewayDisplayName]?.commission !== undefined) {
          commission = gatewaySettings[gatewayDisplayName].commission;
        }

        const amountAfterCommissionUSDT = amountUSDT * (1 - commission / 100);
        totalAmountAfterCommissionUSDT += amountAfterCommissionUSDT;

        // Группируем по шлюзам
        if (!gatewayBreakdown[payment.gateway]) {
          gatewayBreakdown[payment.gateway] = {
            count: 0,
            amountUSDT: 0,
            amountAfterCommissionUSDT: 0,
            commission,
          };
        }

        gatewayBreakdown[payment.gateway].count++;
        gatewayBreakdown[payment.gateway].amountUSDT += amountUSDT;
        gatewayBreakdown[payment.gateway].amountAfterCommissionUSDT += amountAfterCommissionUSDT;

        // Находим самый старый платеж
        if (payment.paidAt && payment.paidAt < oldestPaymentDate) {
          oldestPaymentDate = payment.paidAt;
        }
      }

      // Применяем фильтр по минимальной сумме
      if (filters.minAmount && totalAmountAfterCommissionUSDT < filters.minAmount) {
        continue;
      }

      merchantsData.push({
        id: merchant.id,
        fullName: merchant.name,
        username: merchant.username,
        telegramId: merchant.telegram,
        merchantUrl: merchant.shopUrl,
        wallets: {
          usdtPolygonWallet: merchant.usdtPolygonWallet,
          usdtTrcWallet: merchant.usdtTrcWallet,
          usdtErcWallet: merchant.usdtErcWallet,
          usdcPolygonWallet: merchant.usdcPolygonWallet,
        },
        totalAmountUSDT: Math.round(totalAmountUSDT * 100) / 100,
        totalAmountAfterCommissionUSDT: Math.round(totalAmountAfterCommissionUSDT * 100) / 100,
        paymentsCount: merchant.payments.length,
        oldestPaymentDate,
        gatewayBreakdown: Object.entries(gatewayBreakdown).map(([gateway, data]) => ({
          gateway,
          count: data.count,
          amountUSDT: Math.round(data.amountUSDT * 100) / 100,
          amountAfterCommissionUSDT: Math.round(data.amountAfterCommissionUSDT * 100) / 100,
          commission: data.commission,
        })),
      });
    }

    // Сортируем по сумме (по убыванию)
    merchantsData.sort((a, b) => b.totalAmountAfterCommissionUSDT - a.totalAmountAfterCommissionUSDT);

    // Пагинация
    const total = merchantsData.length;
    const skip = (filters.page - 1) * filters.limit;
    const paginatedMerchants = merchantsData.slice(skip, skip + filters.limit);

    // Суммарная статистика
    const summary = {
      totalMerchants: total,
      totalAmountUSDT: Math.round(merchantsData.reduce((sum, m) => sum + m.totalAmountUSDT, 0) * 100) / 100,
      totalAmountAfterCommissionUSDT: Math.round(merchantsData.reduce((sum, m) => sum + m.totalAmountAfterCommissionUSDT, 0) * 100) / 100,
    };

    console.log('💰 Merchants awaiting payout summary:', summary);

    return {
      merchants: paginatedMerchants,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
      summary,
    };
  }

  // Create payout
  async createPayout(payoutData: CreatePayoutRequest): Promise<PayoutResponse> {
    const { shopId, amount, network, notes, periodFrom, periodTo } = payoutData;

    // Verify shop exists
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, username: true },
    });

    if (!shop) {
      throw new Error('Shop not found');
    }

    // ✅ НОВОЕ: Валидация периода выплаты
    let periodFromDate: Date | undefined;
    let periodToDate: Date | undefined;

    if (periodFrom && periodTo) {
      periodFromDate = new Date(periodFrom);
      periodToDate = new Date(periodTo);

      // Проверяем корректность дат
      if (periodFromDate >= periodToDate) {
        throw new Error('Period start date must be before end date');
      }

      if (periodToDate > new Date()) {
        throw new Error('Period end date cannot be in the future');
      }

      console.log(`💰 Creating payout for period: ${periodFromDate.toISOString()} - ${periodToDate.toISOString()}`);
    }

    // Create payout
    const payout = await prisma.payout.create({
      data: {
        shopId,
        amount,
        network,
        status: 'COMPLETED', // Admin-created payouts are always completed
        notes,
        periodFrom: periodFromDate, // ✅ НОВОЕ: Сохраняем период выплаты
        periodTo: periodToDate,     // ✅ НОВОЕ: Сохраняем период выплаты
        paidAt: new Date(), // Set to current time for admin payouts
      },
    });

    console.log(`💰 Payout created: ${payout.id} for shop ${shop.username} (${amount} USDT via ${network})`);

    // ✅ НОВОЕ: Если указан период, помечаем соответствующие платежи как оплаченные
    if (periodFromDate && periodToDate) {
      const updatedPayments = await prisma.payment.updateMany({
        where: {
          shopId,
          status: 'PAID',
          merchantPaid: false,
          paidAt: {
            gte: periodFromDate,
            lte: periodToDate,
          },
        },
        data: {
          merchantPaid: true,
        },
      });

      console.log(`💰 Marked ${updatedPayments.count} payments as paid for period ${periodFromDate.toISOString()} - ${periodToDate.toISOString()}`);
    }

    return {
      id: payout.id,
      shopId: payout.shopId,
      shopName: shop.name,
      shopUsername: shop.username,
      amount: payout.amount,
      network: payout.network,
      status: payout.status,
      txid: payout.txid,
      notes: payout.notes,
      periodFrom: payout.periodFrom, // ✅ НОВОЕ: Возвращаем период выплаты
      periodTo: payout.periodTo,     // ✅ НОВОЕ: Возвращаем период выплаты
      createdAt: payout.createdAt,
      paidAt: payout.paidAt,
    };
  }

  // Get all payouts with pagination and filters
  async getAllPayouts(filters: PayoutFilters): Promise<{
    payouts: PayoutResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, shopId, network, dateFrom, dateTo, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (shopId) {
      where.shopId = shopId;
    }

    if (network) {
      where.network = network;
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

    if (search) {
      where.OR = [
        { shop: { name: { contains: search, mode: 'insensitive' } } },
        { shop: { username: { contains: search, mode: 'insensitive' } } },
        { notes: { contains: search, mode: 'insensitive' } },
        { txid: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: {
            select: { name: true, username: true },
          },
        },
      }),
      prisma.payout.count({ where }),
    ]);

    return {
      payouts: payouts.map(payout => ({
        id: payout.id,
        shopId: payout.shopId,
        shopName: payout.shop.name,
        shopUsername: payout.shop.username,
        amount: payout.amount,
        network: payout.network,
        status: payout.status,
        txid: payout.txid,
        notes: payout.notes,
        periodFrom: payout.periodFrom, // ✅ НОВОЕ: Возвращаем период выплаты
        periodTo: payout.periodTo,     // ✅ НОВОЕ: Возвращаем период выплаты
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

  // Get payout by ID
  async getPayoutById(id: string): Promise<PayoutResponse | null> {
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: {
        shop: {
          select: { name: true, username: true },
        },
      },
    });

    if (!payout) return null;

    return {
      id: payout.id,
      shopId: payout.shopId,
      shopName: payout.shop.name,
      shopUsername: payout.shop.username,
      amount: payout.amount,
      network: payout.network,
      status: payout.status,
      txid: payout.txid,
      notes: payout.notes,
      periodFrom: payout.periodFrom, // ✅ НОВОЕ: Возвращаем период выплаты
      periodTo: payout.periodTo,     // ✅ НОВОЕ: Возвращаем период выплаты
      createdAt: payout.createdAt,
      paidAt: payout.paidAt,
    };
  }

  // Delete payout
  async deletePayout(id: string): Promise<void> {
    await prisma.payout.delete({
      where: { id },
    });
  }

  // Get all payments with pagination and filters
  async getAllPayments(filters: any): Promise<{
    payments: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, status, gateway, shopId, dateFrom, dateTo, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }

    if (gateway) {
      where.gateway = gateway;
    }

    if (shopId) {
      where.shopId = shopId;
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

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { orderId: { contains: search, mode: 'insensitive' } },
        { gatewayOrderId: { contains: search, mode: 'insensitive' } },
        { gatewayPaymentId: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { shop: { name: { contains: search, mode: 'insensitive' } } },
        { shop: { username: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: {
            select: { name: true, username: true },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map(payment => ({
        id: payment.id,
        shopId: payment.shopId,
        gateway: payment.gateway,
        amount: payment.amount,
        currency: payment.currency,
        sourceCurrency: payment.sourceCurrency,
        usage: payment.usage,
        status: payment.status,
        externalPaymentUrl: payment.externalPaymentUrl,
        successUrl: payment.successUrl,
        failUrl: payment.failUrl,
        pendingUrl: payment.pendingUrl,
        whiteUrl: payment.whiteUrl,
        expiresAt: payment.expiresAt,
        orderId: payment.orderId,
        gatewayOrderId: payment.gatewayOrderId,
        gatewayPaymentId: payment.gatewayPaymentId,
        customerEmail: payment.customerEmail,
        customerName: payment.customerName,
        // ✅ НОВОЕ: Добавлены поля для информации о клиенте
        customerCountry: payment.customerCountry,
        customerIp: payment.customerIp,
        customerUa: payment.customerUa,
        invoiceTotalSum: payment.invoiceTotalSum,
        qrCode: payment.qrCode,
        qrUrl: payment.qrUrl,
        txUrls: payment.txUrls,
        country: payment.country,
        language: payment.language,
        amountIsEditable: payment.amountIsEditable,
        maxPayments: payment.maxPayments,
        rapydCustomer: payment.rapydCustomer,
        cardLast4: payment.cardLast4,
        paymentMethod: payment.paymentMethod,
        bankId: payment.bankId,
        remitterIban: payment.remitterIban,
        remitterName: payment.remitterName,
        paidAt: payment.paidAt,
        merchantPaid: payment.merchantPaid,
        chargebackAmount: payment.chargebackAmount,
        adminNotes: payment.adminNotes,
        statusChangedBy: payment.statusChangedBy,
        statusChangedAt: payment.statusChangedAt,
        failureMessage: payment.failureMessage,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        shop: payment.shop,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get payment by ID
  async getPaymentById(id: string): Promise<any | null> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        shop: {
          select: { name: true, username: true },
        },
      },
    });

    if (!payment) return null;

    return {
      id: payment.id,
      shopId: payment.shopId,
      gateway: payment.gateway,
      amount: payment.amount,
      currency: payment.currency,
      sourceCurrency: payment.sourceCurrency,
      usage: payment.usage,
      status: payment.status,
      externalPaymentUrl: payment.externalPaymentUrl,
      successUrl: payment.successUrl,
      failUrl: payment.failUrl,
      pendingUrl: payment.pendingUrl,
      whiteUrl: payment.whiteUrl,
      expiresAt: payment.expiresAt,
      orderId: payment.orderId,
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: payment.gatewayPaymentId,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      // ✅ НОВОЕ: Добавлены поля для информации о клиенте
      customerCountry: payment.customerCountry,
      customerIp: payment.customerIp,
      customerUa: payment.customerUa,
      invoiceTotalSum: payment.invoiceTotalSum,
      qrCode: payment.qrCode,
      qrUrl: payment.qrUrl,
      txUrls: payment.txUrls,
      country: payment.country,
      language: payment.language,
      amountIsEditable: payment.amountIsEditable,
      maxPayments: payment.maxPayments,
      rapydCustomer: payment.rapydCustomer,
      cardLast4: payment.cardLast4,
      paymentMethod: payment.paymentMethod,
      bankId: payment.bankId,
      remitterIban: payment.remitterIban,
      remitterName: payment.remitterName,
      paidAt: payment.paidAt,
      merchantPaid: payment.merchantPaid,
      chargebackAmount: payment.chargebackAmount,
      adminNotes: payment.adminNotes,
      statusChangedBy: payment.statusChangedBy,
      statusChangedAt: payment.statusChangedAt,
      failureMessage: payment.failureMessage,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      shop: payment.shop,
    };
  }

  // Update payment status
  async updatePaymentStatus(id: string, status: string, notes?: string, chargebackAmount?: number): Promise<any> {
    const updateData: any = {
      status: status.toUpperCase(),
      updatedAt: new Date(),
      statusChangedBy: 'admin',
      statusChangedAt: new Date(),
    };

    if (notes) {
      updateData.adminNotes = notes;
    }

    if (status.toUpperCase() === 'CHARGEBACK' && chargebackAmount) {
      updateData.chargebackAmount = chargebackAmount;
    }

    if (status.toUpperCase() === 'PAID') {
      updateData.paidAt = new Date();
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: updateData,
      include: {
        shop: {
          select: { name: true, username: true },
        },
      },
    });

    return {
      id: payment.id,
      shopId: payment.shopId,
      gateway: payment.gateway,
      amount: payment.amount,
      currency: payment.currency,
      sourceCurrency: payment.sourceCurrency,
      usage: payment.usage,
      status: payment.status,
      externalPaymentUrl: payment.externalPaymentUrl,
      successUrl: payment.successUrl,
      failUrl: payment.failUrl,
      pendingUrl: payment.pendingUrl,
      whiteUrl: payment.whiteUrl,
      expiresAt: payment.expiresAt,
      orderId: payment.orderId,
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: payment.gatewayPaymentId,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      // ✅ НОВОЕ: Добавлены поля для информации о клиенте
      customerCountry: payment.customerCountry,
      customerIp: payment.customerIp,
      customerUa: payment.customerUa,
      invoiceTotalSum: payment.invoiceTotalSum,
      qrCode: payment.qrCode,
      qrUrl: payment.qrUrl,
      txUrls: payment.txUrls,
      country: payment.country,
      language: payment.language,
      amountIsEditable: payment.amountIsEditable,
      maxPayments: payment.maxPayments,
      rapydCustomer: payment.rapydCustomer,
      cardLast4: payment.cardLast4,
      paymentMethod: payment.paymentMethod,
      bankId: payment.bankId,
      remitterIban: payment.remitterIban,
      remitterName: payment.remitterName,
      paidAt: payment.paidAt,
      merchantPaid: payment.merchantPaid,
      chargebackAmount: payment.chargebackAmount,
      adminNotes: payment.adminNotes,
      statusChangedBy: payment.statusChangedBy,
      statusChangedAt: payment.statusChangedAt,
      failureMessage: payment.failureMessage,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      shop: payment.shop,
    };
  }

  // ✅ НОВОЕ: Update customer data
  async updateCustomerData(id: string, customerData: UpdateCustomerDataRequest): Promise<any> {
    console.log(`🔄 Updating customer data for payment ${id}:`, customerData);

    const updateData: any = {
      updatedAt: new Date(),
    };

    // Добавляем только переданные поля
    if (customerData.customerCountry !== undefined) {
      updateData.customerCountry = customerData.customerCountry || null;
    }

    if (customerData.customerIp !== undefined) {
      updateData.customerIp = customerData.customerIp || null;
    }

    if (customerData.customerUa !== undefined) {
      updateData.customerUa = customerData.customerUa || null;
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        customerCountry: true,
        customerIp: true,
        customerUa: true,
        updatedAt: true,
      },
    });

    console.log(`✅ Customer data updated for payment ${id}:`, {
      customerCountry: payment.customerCountry,
      customerIp: payment.customerIp,
      customerUa: payment.customerUa,
    });

    return {
      id: payment.id,
      customerCountry: payment.customerCountry,
      customerIp: payment.customerIp,
      customerUa: payment.customerUa,
      updatedAt: payment.updatedAt,
    };
  }

  // User management methods
  async getAllUsers(filters: any): Promise<{
    users: UserResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, limit, status } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }

    const [users, total] = await Promise.all([
      prisma.shop.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
        },
      }),
      prisma.shop.count({ where }),
    ]);

    return {
      users: users.map(user => ({
        id: user.id,
        fullName: user.name,
        username: user.username,
        telegramId: user.telegram,
        merchantUrl: user.shopUrl,
        gateways: user.paymentGateways ? JSON.parse(user.paymentGateways) : null,
        gatewaySettings: user.gatewaySettings ? JSON.parse(user.gatewaySettings) : null,
        publicKey: user.publicKey,
        wallets: {
          usdtPolygonWallet: user.usdtPolygonWallet,
          usdtTrcWallet: user.usdtTrcWallet,
          usdtErcWallet: user.usdtErcWallet,
          usdcPolygonWallet: user.usdcPolygonWallet,
        },
        status: user.status,
        createdAt: user.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string): Promise<UserResponse | null> {
    const user = await prisma.shop.findUnique({
      where: { id },
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
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      fullName: user.name,
      username: user.username,
      telegramId: user.telegram,
      merchantUrl: user.shopUrl,
      gateways: user.paymentGateways ? JSON.parse(user.paymentGateways) : null,
      gatewaySettings: user.gatewaySettings ? JSON.parse(user.gatewaySettings) : null,
      publicKey: user.publicKey,
      wallets: {
        usdtPolygonWallet: user.usdtPolygonWallet,
        usdtTrcWallet: user.usdtTrcWallet,
        usdtErcWallet: user.usdtErcWallet,
        usdcPolygonWallet: user.usdcPolygonWallet,
      },
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async createUser(userData: CreateUserRequest): Promise<UserResponse> {
    const {
      fullName,
      username,
      password,
      telegramId,
      merchantUrl,
      gateways,
      gatewaySettings,
      wallets
    } = userData;

    // Check if username already exists
    const existingUser = await prisma.shop.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Check if telegram already exists (if provided)
    if (telegramId) {
      const existingTelegram = await prisma.shop.findUnique({
        where: { telegram: telegramId },
      });

      if (existingTelegram) {
        throw new Error('Telegram username already exists');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate API keys
    const publicKey = 'pk_' + crypto.randomBytes(32).toString('hex');
    const secretKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    // Create user
    const newUser = await prisma.shop.create({
      data: {
        name: fullName,
        username,
        password: hashedPassword,
        telegram: telegramId,
        shopUrl: merchantUrl,
        paymentGateways: gateways ? JSON.stringify(gateways) : null,
        gatewaySettings: gatewaySettings ? JSON.stringify(gatewaySettings) : null,
        usdtPolygonWallet: wallets?.usdtPolygonWallet || null,
        usdtTrcWallet: wallets?.usdtTrcWallet || null,
        usdtErcWallet: wallets?.usdtErcWallet || null,
        usdcPolygonWallet: wallets?.usdcPolygonWallet || null,
        publicKey,
        secretKey,
        status: 'ACTIVE',
      },
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
      },
    });

    return {
      id: newUser.id,
      fullName: newUser.name,
      username: newUser.username,
      telegramId: newUser.telegram,
      merchantUrl: newUser.shopUrl,
      gateways: newUser.paymentGateways ? JSON.parse(newUser.paymentGateways) : null,
      gatewaySettings: newUser.gatewaySettings ? JSON.parse(newUser.gatewaySettings) : null,
      publicKey: newUser.publicKey,
      wallets: {
        usdtPolygonWallet: newUser.usdtPolygonWallet,
        usdtTrcWallet: newUser.usdtTrcWallet,
        usdtErcWallet: newUser.usdtErcWallet,
        usdcPolygonWallet: newUser.usdcPolygonWallet,
      },
      status: newUser.status,
      createdAt: newUser.createdAt,
    };
  }

  async updateUser(id: string, updateData: UpdateUserRequest): Promise<UserResponse> {
    const updatePayload: any = { ...updateData };

    // Hash password if provided
    if (updateData.password) {
      updatePayload.password = await bcrypt.hash(updateData.password, 12);
    }

    // Handle field name mappings
    if (updateData.fullName) {
      updatePayload.name = updateData.fullName;
      delete updatePayload.fullName;
    }

    if (updateData.telegramId) {
      updatePayload.telegram = updateData.telegramId;
      delete updatePayload.telegramId;
    }

    if (updateData.merchantUrl) {
      updatePayload.shopUrl = updateData.merchantUrl;
      delete updatePayload.merchantUrl;
    }

    // Handle gateways
    if (updateData.gateways) {
      updatePayload.paymentGateways = JSON.stringify(updateData.gateways);
      delete updatePayload.gateways;
    }

    // Handle gateway settings
    if (updateData.gatewaySettings) {
      updatePayload.gatewaySettings = JSON.stringify(updateData.gatewaySettings);
      delete updatePayload.gatewaySettings;
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
      delete updatePayload.wallets;
    }

    const updatedUser = await prisma.shop.update({
      where: { id },
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
      },
    });

    return {
      id: updatedUser.id,
      fullName: updatedUser.name,
      username: updatedUser.username,
      telegramId: updatedUser.telegram,
      merchantUrl: updatedUser.shopUrl,
      gateways: updatedUser.paymentGateways ? JSON.parse(updatedUser.paymentGateways) : null,
      gatewaySettings: updatedUser.gatewaySettings ? JSON.parse(updatedUser.gatewaySettings) : null,
      publicKey: updatedUser.publicKey,
      wallets: {
        usdtPolygonWallet: updatedUser.usdtPolygonWallet,
        usdtTrcWallet: updatedUser.usdtTrcWallet,
        usdtErcWallet: updatedUser.usdtErcWallet,
        usdcPolygonWallet: updatedUser.usdcPolygonWallet,
      },
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
    };
  }

  async deleteUser(id: string): Promise<void> {
    await prisma.shop.delete({
      where: { id },
    });
  }

  async suspendUser(id: string): Promise<UserResponse> {
    const user = await prisma.shop.update({
      where: { id },
      data: { status: 'SUSPENDED' },
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
      },
    });

    return {
      id: user.id,
      fullName: user.name,
      username: user.username,
      telegramId: user.telegram,
      merchantUrl: user.shopUrl,
      gateways: user.paymentGateways ? JSON.parse(user.paymentGateways) : null,
      gatewaySettings: user.gatewaySettings ? JSON.parse(user.gatewaySettings) : null,
      publicKey: user.publicKey,
      wallets: {
        usdtPolygonWallet: user.usdtPolygonWallet,
        usdtTrcWallet: user.usdtTrcWallet,
        usdtErcWallet: user.usdtErcWallet,
        usdcPolygonWallet: user.usdcPolygonWallet,
      },
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async activateUser(id: string): Promise<UserResponse> {
    const user = await prisma.shop.update({
      where: { id },
      data: { status: 'ACTIVE' },
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
      },
    });

    return {
      id: user.id,
      fullName: user.name,
      username: user.username,
      telegramId: user.telegram,
      merchantUrl: user.shopUrl,
      gateways: user.paymentGateways ? JSON.parse(user.paymentGateways) : null,
      gatewaySettings: user.gatewaySettings ? JSON.parse(user.gatewaySettings) : null,
      publicKey: user.publicKey,
      wallets: {
        usdtPolygonWallet: user.usdtPolygonWallet,
        usdtTrcWallet: user.usdtTrcWallet,
        usdtErcWallet: user.usdtErcWallet,
        usdcPolygonWallet: user.usdcPolygonWallet,
      },
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  // Helper methods
  private async calculateTotalRevenue(startDate: Date): Promise<number> {
    const payments = await prisma.payment.findMany({
      where: {
        status: 'PAID',
        createdAt: { gte: startDate },
      },
      select: {
        amount: true,
        currency: true,
      },
    });

    let totalRevenue = 0;
    for (const payment of payments) {
      const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
      totalRevenue += usdtAmount;
    }

    return totalRevenue;
  }

  private async calculateTotalPayouts(startDate: Date): Promise<number> {
    const result = await prisma.payout.aggregate({
      where: {
        createdAt: { gte: startDate },
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  }

  private async calculateTotalPayoutAmount(): Promise<number> {
    const result = await prisma.payout.aggregate({
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  }

  private async calculateCompletedPayoutAmount(): Promise<number> {
    const result = await prisma.payout.aggregate({
      where: {
        status: 'COMPLETED',
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  }
}