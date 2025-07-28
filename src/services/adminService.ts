import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { currencyService } from './currencyService';
import { 
  PayoutStats, 
  MerchantAwaitingPayout, 
  MerchantsAwaitingPayoutFilters, 
  CreatePayoutRequest, 
  PayoutResponse, 
  PayoutFilters,
  MerchantStatisticsFilters,
  MerchantStatistics
} from '../types/admin';
import { CreateUserRequest, UserResponse, UpdateUserRequest } from '../types/user';
import { UpdateCustomerDataRequest } from '../types/payment'; // ✅ ДОБАВЛЕНО

export class AdminService {
  // ✅ ИСПРАВЛЕНО: Возвращаем правильную структуру PayoutStats
  async getPayoutStats(): Promise<PayoutStats> {
    console.log('📊 Calculating payout statistics...');

    // ✅ НОВОЕ: Используем новые поля balance и totalPaidOut для быстрого расчета
    const shopStats = await prisma.shop.aggregate({
      _sum: {
        balance: true,
        totalPaidOut: true,
      },
      where: {
        status: 'ACTIVE', // Учитываем только активные магазины
      },
    });

    // Получаем выплаты за текущий месяц
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const thisMonthStats = await prisma.payout.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        status: 'COMPLETED',
      },
    });

    const totalPaidOut = shopStats._sum.totalPaidOut || 0;
    const awaitingPayout = shopStats._sum.balance || 0;
    const thisMonth = thisMonthStats._sum.amount || 0;

    // ✅ ИСПРАВЛЕНО: Возвращаем правильную структуру PayoutStats
    const stats: PayoutStats = {
      totalPayout: Math.round(totalPaidOut * 100) / 100,      // Общая сумма выплат всем мерчантам
      awaitingPayout: Math.round(awaitingPayout * 100) / 100, // Общий баланс всех мерчантов
      thisMonth: Math.round(thisMonth * 100) / 100,           // Выплаты за текущий месяц
      availableBalance: Math.round(awaitingPayout * 100) / 100, // Доступный баланс = awaiting payout
    };

    console.log('📊 Payout statistics calculated:');
    console.log(`   💰 Total payout: ${stats.totalPayout} USDT (total paid to merchants)`);
    console.log(`   ⏳ Awaiting payout: ${stats.awaitingPayout} USDT (total merchant balances)`);
    console.log(`   💵 Available balance: ${stats.availableBalance} USDT (same as awaiting)`);
    console.log(`   📅 This month: ${stats.thisMonth} USDT`);

    return stats;
  }

  // ✅ ДОБАВЛЕНО: Метод для обновления клиентских данных
  async updateCustomerData(paymentId: string, customerData: UpdateCustomerDataRequest): Promise<any> {
    console.log(`🔄 Updating customer data for payment ${paymentId}:`, customerData);

    // Проверяем существование платежа
    const existingPayment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        customerCountry: true,
        customerIp: true,
        customerUa: true,
      },
    });

    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    // Подготавливаем данные для обновления
    const updateData: any = {};
    
    if (customerData.customerCountry !== undefined) {
      updateData.customerCountry = customerData.customerCountry || null;
    }
    
    if (customerData.customerIp !== undefined) {
      updateData.customerIp = customerData.customerIp || null;
    }
    
    if (customerData.customerUa !== undefined) {
      updateData.customerUa = customerData.customerUa || null;
    }

    // Обновляем платеж
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        customerEmail: true,
        customerName: true,
        customerCountry: true,
        customerIp: true,
        customerUa: true,
        updatedAt: true,
      },
    });

    console.log(`✅ Customer data updated for payment ${paymentId}`);
    console.log(`   🌍 Country: ${existingPayment.customerCountry} -> ${updatedPayment.customerCountry}`);
    console.log(`   🌐 IP: ${existingPayment.customerIp} -> ${updatedPayment.customerIp}`);
    console.log(`   🖥️ User Agent: ${existingPayment.customerUa ? 'set' : 'not set'} -> ${updatedPayment.customerUa ? 'set' : 'not set'}`);

    return updatedPayment;
  }

  // Остальные методы остаются без изменений...
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalShops,
      activeShops,
      totalPayments,
      successfulPayments,
      totalRevenue,
      recentPayments,
    ] = await Promise.all([
      prisma.shop.count(),
      prisma.shop.count({ where: { status: 'ACTIVE' } }),
      prisma.payment.count({
        where: { 
          createdAt: { gte: startDate },
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
      }),
      prisma.payment.count({
        where: {
          status: 'PAID',
          createdAt: { gte: startDate },
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
      }),
      prisma.payment.findMany({
        where: {
          status: 'PAID',
          createdAt: { gte: startDate },
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
        select: {
          amount: true,
          currency: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      }),
    ]);

    let totalRevenueUSDT = 0;
    for (const payment of totalRevenue) {
      const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
      totalRevenueUSDT += usdtAmount;
    }

    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return {
      totalShops,
      activeShops,
      totalPayments,
      successfulPayments,
      totalRevenue: Math.round(totalRevenueUSDT * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
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

  async getMerchantStatistics(filters: MerchantStatisticsFilters): Promise<MerchantStatistics> {
    console.log('📊 Getting merchant statistics with filters:', filters);

    // Определяем период
    let startDate: Date;
    let endDate: Date = new Date();

    if (filters.period === 'custom' && filters.dateFrom && filters.dateTo) {
      startDate = new Date(filters.dateFrom);
      endDate = new Date(filters.dateTo);
    } else {
      const now = new Date();
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

    console.log(`📅 Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Базовые условия для запроса
    const whereConditions: any = {
      status: 'PAID',
      gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
      paidAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Фильтр по конкретному мерчанту
    if (filters.shopId) {
      whereConditions.shopId = filters.shopId;
    }

    // Получаем все оплаченные платежи за период
    const payments = await prisma.payment.findMany({
      where: whereConditions,
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

    console.log(`💰 Found ${payments.length} paid payments for analysis`);

    // Инициализируем переменные для подсчета
    let totalTurnover = 0;
    let merchantEarnings = 0;
    let gatewayEarnings = 0;
    const gatewayBreakdown: Record<string, any> = {};
    const merchantBreakdown: Record<string, any> = {};
    const dailyData: Record<string, any> = {};

    // Обрабатываем каждый платеж
    for (const payment of payments) {
      try {
        // Конвертируем в USDT
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        
        // Получаем настройки комиссий
        let gatewaySettings: Record<string, any> = {};
        if (payment.shop.gatewaySettings) {
          try {
            gatewaySettings = JSON.parse(payment.shop.gatewaySettings);
          } catch (error) {
            console.error(`Error parsing gateway settings for shop ${payment.shopId}:`, error);
          }
        }

        // Определяем комиссию (по умолчанию 10%)
        const commission = gatewaySettings.commission || 10;
        const commissionAmount = amountUSDT * (commission / 100);
        const merchantAmount = amountUSDT - commissionAmount;

        // Общие суммы
        totalTurnover += amountUSDT;
        merchantEarnings += merchantAmount;
        gatewayEarnings += commissionAmount;

        // Разбивка по шлюзам
        if (!gatewayBreakdown[payment.gateway]) {
          gatewayBreakdown[payment.gateway] = {
            gateway: payment.gateway,
            gatewayDisplayName: this.getGatewayDisplayName(payment.gateway),
            paymentsCount: 0,
            turnoverUSDT: 0,
            commissionUSDT: 0,
            merchantEarningsUSDT: 0,
            totalCommissionRate: 0,
          };
        }

        gatewayBreakdown[payment.gateway].paymentsCount++;
        gatewayBreakdown[payment.gateway].turnoverUSDT += amountUSDT;
        gatewayBreakdown[payment.gateway].commissionUSDT += commissionAmount;
        gatewayBreakdown[payment.gateway].merchantEarningsUSDT += merchantAmount;
        gatewayBreakdown[payment.gateway].totalCommissionRate += commission;

        // Разбивка по мерчантам (если не выбран конкретный мерчант)
        if (!filters.shopId) {
          if (!merchantBreakdown[payment.shopId]) {
            merchantBreakdown[payment.shopId] = {
              shopId: payment.shopId,
              shopName: payment.shop.name,
              shopUsername: payment.shop.username,
              paymentsCount: 0,
              turnoverUSDT: 0,
              commissionUSDT: 0,
              merchantEarningsUSDT: 0,
              paidOutUSDT: 0, // Будем считать отдельно
              averageCheckUSDT: 0,
            };
          }

          merchantBreakdown[payment.shopId].paymentsCount++;
          merchantBreakdown[payment.shopId].turnoverUSDT += amountUSDT;
          merchantBreakdown[payment.shopId].commissionUSDT += commissionAmount;
          merchantBreakdown[payment.shopId].merchantEarningsUSDT += merchantAmount;
        }

        // Данные по дням
        const dateKey = payment.paidAt!.toISOString().split('T')[0];
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = {
            date: dateKey,
            turnover: 0,
            merchantEarnings: 0,
            gatewayEarnings: 0,
            paymentsCount: 0,
          };
        }

        dailyData[dateKey].turnover += amountUSDT;
        dailyData[dateKey].merchantEarnings += merchantAmount;
        dailyData[dateKey].gatewayEarnings += commissionAmount;
        dailyData[dateKey].paymentsCount++;

      } catch (error) {
        console.error(`Error processing payment ${payment.id}:`, error);
      }
    }

    // Рассчитываем средние комиссии для шлюзов
    Object.values(gatewayBreakdown).forEach((gateway: any) => {
      gateway.averageCommissionRate = gateway.paymentsCount > 0 
        ? gateway.totalCommissionRate / gateway.paymentsCount 
        : 0;
      delete gateway.totalCommissionRate;
    });

    // Рассчитываем средний чек для мерчантов
    Object.values(merchantBreakdown).forEach((merchant: any) => {
      merchant.averageCheckUSDT = merchant.paymentsCount > 0 
        ? merchant.turnoverUSDT / merchant.paymentsCount 
        : 0;
    });

    // Получаем данные о выплатах
    let totalPaidOut = 0;
    if (filters.shopId) {
      const payouts = await prisma.payout.findMany({
        where: {
          shopId: filters.shopId,
          status: 'COMPLETED',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: { amount: true },
      });
      totalPaidOut = payouts.reduce((sum, payout) => sum + payout.amount, 0);
    }

    // Рассчитываем общие метрики
    const totalPayments = payments.length;
    const successfulPayments = payments.length; // Все платежи уже PAID
    const averageCheck = totalPayments > 0 ? totalTurnover / totalPayments : 0;
    const conversionRate = 100; // 100% так как все платежи успешные

    const daysCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const result: MerchantStatistics = {
      totalTurnover: Math.round(totalTurnover * 100) / 100,
      merchantEarnings: Math.round(merchantEarnings * 100) / 100,
      gatewayEarnings: Math.round(gatewayEarnings * 100) / 100,
      totalPaidOut: Math.round(totalPaidOut * 100) / 100,
      averageCheck: Math.round(averageCheck * 100) / 100,
      totalPayments,
      successfulPayments,
      conversionRate,
      gatewayBreakdown: Object.values(gatewayBreakdown).map((gateway: any) => ({
        ...gateway,
        turnoverUSDT: Math.round(gateway.turnoverUSDT * 100) / 100,
        commissionUSDT: Math.round(gateway.commissionUSDT * 100) / 100,
        merchantEarningsUSDT: Math.round(gateway.merchantEarningsUSDT * 100) / 100,
        averageCommissionRate: Math.round(gateway.averageCommissionRate * 100) / 100,
      })),
      merchantBreakdown: filters.shopId ? undefined : Object.values(merchantBreakdown).map((merchant: any) => ({
        ...merchant,
        turnoverUSDT: Math.round(merchant.turnoverUSDT * 100) / 100,
        commissionUSDT: Math.round(merchant.commissionUSDT * 100) / 100,
        merchantEarningsUSDT: Math.round(merchant.merchantEarningsUSDT * 100) / 100,
        paidOutUSDT: Math.round(merchant.paidOutUSDT * 100) / 100,
        averageCheckUSDT: Math.round(merchant.averageCheckUSDT * 100) / 100,
      })),
      dailyData: Object.values(dailyData).map((day: any) => ({
        ...day,
        turnover: Math.round(day.turnover * 100) / 100,
        merchantEarnings: Math.round(day.merchantEarnings * 100) / 100,
        gatewayEarnings: Math.round(day.gatewayEarnings * 100) / 100,
      })).sort((a, b) => a.date.localeCompare(b.date)),
      periodInfo: {
        from: startDate,
        to: endDate,
        periodType: filters.period || 'custom',
        daysCount,
      },
    };

    console.log('📊 Merchant statistics calculated:');
    console.log(`   💰 Total turnover: ${result.totalTurnover} USDT`);
    console.log(`   👤 Merchant earnings: ${result.merchantEarnings} USDT`);
    console.log(`   🏪 Gateway earnings: ${result.gatewayEarnings} USDT`);
    console.log(`   📊 Total payments: ${result.totalPayments}`);

    return result;
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
    const { page, limit, minAmount, search } = filters;
    const skip = (page - 1) * limit;

    console.log('📊 Getting merchants awaiting payout with filters:', filters);

    // ✅ НОВОЕ: Получаем мерчантов с положительным балансом
    const whereConditions: any = {
      balance: { gt: 0 }, // Только мерчанты с положительным балансом
      status: 'ACTIVE',   // Только активные мерчанты
    };

    // Применяем фильтры
    if (minAmount) {
      whereConditions.balance.gte = minAmount;
    }

    if (search) {
      whereConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [merchants, total] = await Promise.all([
      prisma.shop.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: { balance: 'desc' }, // Сортируем по убыванию баланса
        select: {
          id: true,
          name: true,
          username: true,
          telegram: true,
          shopUrl: true,
          balance: true,
          totalPaidOut: true,
          usdtPolygonWallet: true,
          usdtTrcWallet: true,
          usdtErcWallet: true,
          usdcPolygonWallet: true,
          createdAt: true,
        },
      }),
      prisma.shop.count({ where: whereConditions }),
    ]);

    console.log(`💰 Found ${merchants.length} merchants with positive balance`);

    // ✅ НОВОЕ: Получаем дополнительную статистику для каждого мерчанта
    const merchantsWithStats = await Promise.all(
      merchants.map(async (merchant) => {
        // Получаем статистику платежей для этого мерчанта
        const [paymentsCount, oldestPayment, gatewayStats] = await Promise.all([
          prisma.payment.count({
            where: {
              shopId: merchant.id,
              status: 'PAID',
              amountUSDT: { not: null },
            },
          }),
          prisma.payment.findFirst({
            where: {
              shopId: merchant.id,
              status: 'PAID',
              amountUSDT: { not: null },
            },
            orderBy: { paidAt: 'asc' },
            select: { paidAt: true },
          }),
          prisma.payment.groupBy({
            by: ['gateway'],
            where: {
              shopId: merchant.id,
              status: 'PAID',
              amountUSDT: { not: null },
            },
            _count: { id: true },
            _sum: { amountUSDT: true },
          }),
        ]);

        const gatewayBreakdown = gatewayStats.map((stat) => ({
          gateway: stat.gateway,
          count: stat._count.id,
          amountUSDT: stat._sum.amountUSDT || 0,
          amountAfterCommissionUSDT: stat._sum.amountUSDT || 0, // Теперь баланс уже учитывает все
          commission: 0, // Комиссия уже учтена в балансе
        }));

        return {
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
          totalAmountUSDT: merchant.balance, // Баланс = доступная сумма
          totalAmountAfterCommissionUSDT: merchant.balance, // Баланс уже учитывает комиссию
          paymentsCount,
          oldestPaymentDate: oldestPayment?.paidAt || merchant.createdAt,
          gatewayBreakdown,
        };
      })
    );

    // Подсчитываем итоговые суммы
    const totalAmountUSDT = merchants.reduce((sum, merchant) => sum + merchant.balance, 0);
    const totalAmountAfterCommissionUSDT = totalAmountUSDT; // Баланс уже учитывает комиссию

    console.log(`📊 Merchants awaiting payout: ${total} merchants, ${Math.round(totalAmountAfterCommissionUSDT * 100) / 100} USDT total`);

    return {
      merchants: merchantsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalMerchants: total,
        totalAmountUSDT: Math.round(totalAmountUSDT * 100) / 100,
        totalAmountAfterCommissionUSDT: Math.round(totalAmountAfterCommissionUSDT * 100) / 100,
      },
    };

    /* ✅ СТАРЫЙ КОД УДАЛЕН - теперь используем поля balance и totalPaidOut
    const paymentsAwaitingPayout = await prisma.payment.findMany({
      where: {
        status: 'PAID',
        merchantPaid: false,
        paidAt: { not: null },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            username: true,
            telegram: true,
            shopUrl: true,
            gatewaySettings: true,
            usdtPolygonWallet: true,
            usdtTrcWallet: true,
            usdtErcWallet: true,
            usdcPolygonWallet: true,
          },
        },
      },
    });

    console.log(`💰 Found ${paymentsAwaitingPayout.length} payments awaiting payout`);

    // Группируем по мерчантам
    const merchantsMap: Record<string, any> = {};

    for (const payment of paymentsAwaitingPayout) {
      const shopId = payment.shopId;
      
      if (!merchantsMap[shopId]) {
        merchantsMap[shopId] = {
          id: payment.shop.id,
          fullName: payment.shop.name,
          username: payment.shop.username,
          telegramId: payment.shop.telegram,
          merchantUrl: payment.shop.shopUrl,
          wallets: {
            usdtPolygonWallet: payment.shop.usdtPolygonWallet,
            usdtTrcWallet: payment.shop.usdtTrcWallet,
            usdtErcWallet: payment.shop.usdtErcWallet,
            usdcPolygonWallet: payment.shop.usdcPolygonWallet,
          },
          totalAmountUSDT: 0,
          totalAmountAfterCommissionUSDT: 0,
          paymentsCount: 0,
          oldestPaymentDate: payment.paidAt,
          gatewayBreakdown: {},
          gatewaySettings: payment.shop.gatewaySettings,
        };
      }

      try {
        // Конвертируем в USDT
        const amountUSDT = await currencyService.convertToUSDT(payment.amount, payment.currency);
        
        // Получаем настройки комиссий
        let gatewaySettings: Record<string, any> = {};
        if (payment.shop.gatewaySettings) {
          try {
            gatewaySettings = JSON.parse(payment.shop.gatewaySettings);
          } catch (error) {
            console.error(`Error parsing gateway settings for shop ${shopId}:`, error);
          }
        }

        // Определяем комиссию (по умолчанию 10%)
        const commission = gatewaySettings.commission || 10;
        const amountAfterCommission = amountUSDT * (1 - commission / 100);

        merchantsMap[shopId].totalAmountUSDT += amountUSDT;
        merchantsMap[shopId].totalAmountAfterCommissionUSDT += amountAfterCommission;
        merchantsMap[shopId].paymentsCount++;

        // Обновляем дату самого старого платежа
        if (payment.paidAt! < merchantsMap[shopId].oldestPaymentDate) {
          merchantsMap[shopId].oldestPaymentDate = payment.paidAt;
        }

        // Разбивка по шлюзам
        if (!merchantsMap[shopId].gatewayBreakdown[payment.gateway]) {
          merchantsMap[shopId].gatewayBreakdown[payment.gateway] = {
            gateway: payment.gateway,
            count: 0,
            amountUSDT: 0,
            amountAfterCommissionUSDT: 0,
            commission: commission,
          };
        }

        merchantsMap[shopId].gatewayBreakdown[payment.gateway].count++;
        merchantsMap[shopId].gatewayBreakdown[payment.gateway].amountUSDT += amountUSDT;
        merchantsMap[shopId].gatewayBreakdown[payment.gateway].amountAfterCommissionUSDT += amountAfterCommission;

      } catch (error) {
        console.error(`Error processing payment ${payment.id}:`, error);
      }
    }

    // Преобразуем в массив и применяем фильтры
    let merchants = Object.values(merchantsMap).map((merchant: any) => ({
      ...merchant,
      totalAmountUSDT: Math.round(merchant.totalAmountUSDT * 100) / 100,
      totalAmountAfterCommissionUSDT: Math.round(merchant.totalAmountAfterCommissionUSDT * 100) / 100,
      gatewayBreakdown: Object.values(merchant.gatewayBreakdown).map((gateway: any) => ({
        ...gateway,
        amountUSDT: Math.round(gateway.amountUSDT * 100) / 100,
        amountAfterCommissionUSDT: Math.round(gateway.amountAfterCommissionUSDT * 100) / 100,
      })),
    }));

    // Применяем фильтры
    if (minAmount) {
      merchants = merchants.filter(merchant => merchant.totalAmountAfterCommissionUSDT >= minAmount);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      merchants = merchants.filter(merchant => 
        merchant.fullName.toLowerCase().includes(searchLower) ||
        merchant.username.toLowerCase().includes(searchLower)
      );
    }

    // Сортируем по сумме (по убыванию)
    merchants.sort((a, b) => b.totalAmountAfterCommissionUSDT - a.totalAmountAfterCommissionUSDT);

    const total = merchants.length;
    const paginatedMerchants = merchants.slice(skip, skip + limit);

    // Подсчитываем итоговые суммы
    const totalAmountUSDT = merchants.reduce((sum, merchant) => sum + merchant.totalAmountUSDT, 0);
    const totalAmountAfterCommissionUSDT = merchants.reduce((sum, merchant) => sum + merchant.totalAmountAfterCommissionUSDT, 0);

    console.log(`📊 Merchants awaiting payout: ${total} merchants, ${Math.round(totalAmountAfterCommissionUSDT * 100) / 100} USDT total`);

    return {
      merchants: paginatedMerchants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalMerchants: total,
        totalAmountUSDT: Math.round(totalAmountUSDT * 100) / 100,
        totalAmountAfterCommissionUSDT: Math.round(totalAmountAfterCommissionUSDT * 100) / 100,
      },
    };
    */
  }

  async createPayout(payoutData: CreatePayoutRequest): Promise<PayoutResponse> {
    const { shopId, amount, network, notes, periodFrom, periodTo } = payoutData;

    // ✅ НОВОЕ: Используем транзакцию для атомарного обновления баланса и создания выплаты
    const result = await prisma.$transaction(async (tx) => {
      // Проверяем существование магазина и получаем текущий баланс
      const shop = await tx.shop.findUnique({
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

      console.log(`💰 Creating payout for shop ${shop.username}:`);
      console.log(`   Current balance: ${shop.balance.toFixed(6)} USDT`);
      console.log(`   Payout amount: ${amount.toFixed(6)} USDT`);
      console.log(`   Current total paid out: ${shop.totalPaidOut.toFixed(6)} USDT`);

      // Проверяем, достаточно ли средств на балансе
      if (shop.balance < amount) {
        throw new Error(`Insufficient balance. Available: ${shop.balance.toFixed(6)} USDT, Requested: ${amount.toFixed(6)} USDT`);
      }

      // Создаем выплату
      const payout = await tx.payout.create({
        data: {
          shopId,
          amount,
          network,
          status: 'COMPLETED', // Всегда COMPLETED для админских выплат
          notes,
          periodFrom: periodFrom ? new Date(periodFrom) : null,
          periodTo: periodTo ? new Date(periodTo) : null,
          createdAt: new Date(),
          paidAt: new Date(), // Устанавливаем время создания как время выплаты
        },
      });

      // ✅ НОВОЕ: Обновляем баланс и общую сумму выплат
      const newBalance = shop.balance - amount;
      const newTotalPaidOut = shop.totalPaidOut + amount;

      await tx.shop.update({
        where: { id: shopId },
        data: {
          balance: newBalance,
          totalPaidOut: newTotalPaidOut,
        },
      });

      console.log(`💰 Shop ${shop.username} balance updated:`);
      console.log(`   Balance: ${shop.balance.toFixed(6)} -> ${newBalance.toFixed(6)} USDT (-${amount.toFixed(6)})`);
      console.log(`   Total paid out: ${shop.totalPaidOut.toFixed(6)} -> ${newTotalPaidOut.toFixed(6)} USDT (+${amount.toFixed(6)})`);

      return { payout, shop };
    });

    console.log(`✅ Payout created: ${result.payout.id} for shop ${result.shop.username} (${amount} USDT)`);

    return {
      id: result.payout.id,
      shopId: result.payout.shopId,
      shopName: result.shop.name,
      shopUsername: result.shop.username,
      amount: result.payout.amount,
      network: result.payout.network,
      status: result.payout.status,
      txid: result.payout.txid,
      notes: result.payout.notes,
      periodFrom: result.payout.periodFrom,
      periodTo: result.payout.periodTo,
      createdAt: result.payout.createdAt,
      paidAt: result.payout.paidAt,
    };
  }

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
            select: {
              name: true,
              username: true,
            },
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
        periodFrom: payout.periodFrom,
        periodTo: payout.periodTo,
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

  async getPayoutById(id: string): Promise<PayoutResponse | null> {
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: {
        shop: {
          select: {
            name: true,
            username: true,
          },
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
      periodFrom: payout.periodFrom,
      periodTo: payout.periodTo,
      createdAt: payout.createdAt,
      paidAt: payout.paidAt,
    };
  }

  async deletePayout(id: string): Promise<void> {
    await prisma.payout.delete({
      where: { id },
    });
  }

  async getAllPayments(filters: any): Promise<any> {
    const { page, limit, status, gateway, shopId, dateFrom, dateTo, search } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    if (gateway) {
      where.gateway = gateway.toLowerCase();
    }

    // Always exclude test gateway from admin payments list
    where.gateway = where.gateway ? where.gateway : { not: 'test_gateway' };
    if (typeof where.gateway === 'string' && where.gateway !== 'test_gateway') {
      // If specific gateway is requested and it's not test_gateway, keep the filter
    } else if (typeof where.gateway === 'string' && where.gateway === 'test_gateway') {
      // If test_gateway is specifically requested, allow it (for debugging purposes)
    } else {
      // Default case: exclude test_gateway
      where.gateway = { not: 'test_gateway' };
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
        { orderId: { contains: search, mode: 'insensitive' } },
        { gatewayOrderId: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
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
      payments: payments.map(payment => ({
        id: payment.id,
        shopId: payment.shopId,
        gateway: payment.gateway,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        orderId: payment.orderId,
        gatewayOrderId: payment.gatewayOrderId,
        customerEmail: payment.customerEmail,
        customerName: payment.customerName,
        customerCountry: payment.customerCountry,
        customerIp: payment.customerIp,
        customerUa: payment.customerUa,
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

  async getPaymentById(id: string): Promise<any | null> {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        shop: {
          select: {
            name: true,
            username: true,
          },
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
      status: payment.status,
      orderId: payment.orderId,
      gatewayOrderId: payment.gatewayOrderId,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      customerCountry: payment.customerCountry,
      customerIp: payment.customerIp,
      customerUa: payment.customerUa,
      failureMessage: payment.failureMessage,
      externalPaymentUrl: payment.externalPaymentUrl,
      successUrl: payment.successUrl,
      failUrl: payment.failUrl,
      pendingUrl: payment.pendingUrl,
      whiteUrl: payment.whiteUrl,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      shop: payment.shop,
    };
  }

  async updatePaymentStatus(id: string, status: string, notes?: string, chargebackAmount?: number): Promise<any> {
    // ✅ НОВОЕ: Используем транзакцию для атомарного обновления платежа и баланса
    const updatedPayment = await prisma.$transaction(async (tx) => {
      // Получаем текущее состояние платежа и магазина
      const currentPayment = await tx.payment.findUnique({
        where: { id },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              username: true,
              balance: true,
            },
          },
        },
      });

      if (!currentPayment) {
        throw new Error('Payment not found');
      }

      const oldStatus = currentPayment.status;
      const newStatus = status.toUpperCase();
      
      console.log(`🔄 Admin updating payment ${id} status: ${oldStatus} -> ${newStatus}`);
      console.log(`💰 Current shop balance: ${currentPayment.shop.balance} USDT`);

      const updateData: any = {
        status: newStatus,
        updatedAt: new Date(),
        statusChangedBy: 'admin',
        statusChangedAt: new Date(),
      };

      if (notes) {
        updateData.adminNotes = notes;
      }

      if (newStatus === 'CHARGEBACK' && chargebackAmount) {
        updateData.chargebackAmount = chargebackAmount;
      }

      // ✅ НОВОЕ: Логика обновления баланса мерчанта
      let balanceChange = 0;
      let newShopBalance = currentPayment.shop.balance;

      // Переход в статус PAID
      if (newStatus === 'PAID' && oldStatus !== 'PAID') {
        updateData.paidAt = new Date();
        
        // Конвертируем сумму в USDT
        const amountUSDT = await currencyService.convertToUSDT(currentPayment.amount, currentPayment.currency);
        updateData.amountUSDT = amountUSDT;
        
        // Добавляем к балансу
        balanceChange = amountUSDT;
        newShopBalance += amountUSDT;
        
        console.log(`💰 Payment ${id} became PAID: +${amountUSDT.toFixed(6)} USDT to balance`);
      }
      
      // Переход из статуса PAID
      else if (oldStatus === 'PAID' && newStatus !== 'PAID') {
        if (currentPayment.amountUSDT) {
          // Вычитаем ранее добавленную сумму
          balanceChange = -currentPayment.amountUSDT;
          newShopBalance -= currentPayment.amountUSDT;
          updateData.amountUSDT = null;
          
          console.log(`💰 Payment ${id} no longer PAID: -${currentPayment.amountUSDT.toFixed(6)} USDT from balance`);
        }
      }
      
      // Специальная обработка CHARGEBACK
      if (newStatus === 'CHARGEBACK') {
        if (oldStatus === 'PAID' && currentPayment.amountUSDT) {
          // Уже обработано выше - вычли amountUSDT
        }
        
        // Дополнительно вычитаем штраф
        if (chargebackAmount && chargebackAmount > 0) {
          balanceChange -= chargebackAmount;
          newShopBalance -= chargebackAmount;
          
          console.log(`💸 CHARGEBACK penalty: -${chargebackAmount.toFixed(6)} USDT from balance`);
        }
      }
      
      // Специальная обработка REFUND
      if (newStatus === 'REFUND' && oldStatus === 'PAID') {
        // Логика уже обработана выше в "Переход из статуса PAID"
        console.log(`🔄 REFUND: Payment amount already deducted from balance`);
      }

      // Обновляем платеж
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: updateData,
        include: {
          shop: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      });

      // ✅ НОВОЕ: Обновляем баланс мерчанта, если он изменился
      if (balanceChange !== 0) {
        await tx.shop.update({
          where: { id: currentPayment.shopId },
          data: {
            balance: newShopBalance,
          },
        });
        
        console.log(`💰 Shop ${currentPayment.shopId} balance updated: ${currentPayment.shop.balance.toFixed(6)} -> ${newShopBalance.toFixed(6)} USDT (${balanceChange > 0 ? '+' : ''}${balanceChange.toFixed(6)})`);
      }

      return updatedPayment;
    });

    return {
      id: updatedPayment.id,
      shopId: updatedPayment.shopId,
      gateway: updatedPayment.gateway,
      amount: updatedPayment.amount,
      currency: updatedPayment.currency,
      status: updatedPayment.status,
      orderId: updatedPayment.orderId,
      gatewayOrderId: updatedPayment.gatewayOrderId,
      customerEmail: updatedPayment.customerEmail,
      customerName: updatedPayment.customerName,
      customerCountry: updatedPayment.customerCountry,
      customerIp: updatedPayment.customerIp,
      customerUa: updatedPayment.customerUa,
      failureMessage: updatedPayment.failureMessage,
      adminNotes: updatedPayment.adminNotes,
      chargebackAmount: updatedPayment.chargebackAmount,
      statusChangedBy: updatedPayment.statusChangedBy,
      statusChangedAt: updatedPayment.statusChangedAt,
      createdAt: updatedPayment.createdAt,
      updatedAt: updatedPayment.updatedAt,
      shop: updatedPayment.shop,
    };
  }

  async updateUser(id: string, updateData: UpdateUserRequest): Promise<UserResponse> {
    const updatePayload: any = { ...updateData };

    if (updateData.password) {
      updatePayload.password = await bcrypt.hash(updateData.password, 12);
    }

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

    if (updateData.gateways) {
      updatePayload.paymentGateways = JSON.stringify(updateData.gateways);
      delete updatePayload.gateways;
    }

    if (updateData.gatewaySettings) {
      updatePayload.gatewaySettings = JSON.stringify(updateData.gatewaySettings);
      delete updatePayload.gatewaySettings;
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

  async suspendUser(id: string): Promise<UserResponse> {
    const updatedUser = await prisma.shop.update({
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

  async activateUser(id: string): Promise<UserResponse> {
    const updatedUser = await prisma.shop.update({
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

  async getAllUsers(filters: any): Promise<any> {
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

    const existingUser = await prisma.shop.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    if (telegramId) {
      const existingTelegram = await prisma.shop.findUnique({
        where: { telegram: telegramId },
      });

      if (existingTelegram) {
        throw new Error('Telegram username already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const publicKey = 'pk_' + crypto.randomBytes(32).toString('hex');
    const secretKey = 'sk_' + crypto.randomBytes(32).toString('hex');

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

  async deleteUser(id: string): Promise<void> {
    await prisma.shop.delete({
      where: { id },
    });
  }
}