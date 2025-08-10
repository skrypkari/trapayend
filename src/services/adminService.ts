import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { currencyService } from './currencyService';
import { getGatewayNameById, getGatewayIdByName } from '../types/gateway'; // ✅ ДОБАВЛЕНО: Импорт маппинга gateway
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

    // ✅ НОВОЕ: Рассчитываем точную сумму ожидающих выплат с учетом комиссий
    const merchantsAwaitingPayout = await this.getMerchantsAwaitingPayout({ 
      page: 1, 
      limit: 1000 // Получаем всех мерчантов для точного расчета
    });

    // ✅ НОВОЕ: Получаем общее количество PAID платежей
    const totalPaymentsCount = await prisma.payment.count({
      where: {
        status: 'PAID',
        gateway: { not: 'test_gateway' }, // Исключаем тестовый шлюз
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
    // ✅ ИСПРАВЛЕНО: Используем точную сумму с учетом комиссий
    const awaitingPayout = merchantsAwaitingPayout.summary.totalAmountAfterCommissionUSDT;
    const thisMonth = thisMonthStats._sum.amount || 0;

    // ✅ ИСПРАВЛЕНО: Возвращаем правильную структуру PayoutStats
    const stats: PayoutStats = {
      totalPayout: Math.round(totalPaidOut * 100) / 100,      // Общая сумма выплат всем мерчантам
      awaitingPayout: Math.round(awaitingPayout * 100) / 100, // Точная сумма с учетом комиссий
      thisMonth: Math.round(thisMonth * 100) / 100,           // Выплаты за текущий месяц
      availableBalance: Math.round(awaitingPayout * 100) / 100, // Доступный баланс = awaiting payout
      totalPayments: totalPaymentsCount,                      // ✅ НОВОЕ: Общее количество PAID платежей
    };

    console.log('📊 Payout statistics calculated:');
    console.log(`   💰 Total payout: ${stats.totalPayout} USDT (total paid to merchants)`);
    console.log(`   ⏳ Awaiting payout: ${stats.awaitingPayout} USDT (with commission deducted)`);
    console.log(`   💵 Available balance: ${stats.availableBalance} USDT (same as awaiting)`);
    console.log(`   📅 This month: ${stats.thisMonth} USDT`);
    console.log(`   💳 Total payments: ${stats.totalPayments} PAID payments`);  // ✅ НОВОЕ: Логирование количества платежей
    console.log(`   🔍 Raw balance sum: ${(shopStats._sum.balance || 0).toFixed(2)} USDT (without commission)`);
    console.log(`   📊 Commission difference: ${((shopStats._sum.balance || 0) - awaitingPayout).toFixed(2)} USDT`);

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
      case 'all':
        // ✅ ИСПРАВЛЕНО: Получаем дату первого платежа в системе
        const firstPayment = await prisma.payment.findFirst({
          where: {
            gateway: { not: 'test_gateway' }, // Exclude test gateway
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        startDate = firstPayment ? firstPayment.createdAt : new Date('2020-01-01');
        console.log(`📅 Period 'all': Using start date from first payment: ${startDate.toISOString()}`);
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
      dailyPayments, // ✅ ДОБАВЛЕНО: Получаем все платежи для дневной статистики
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
      prisma.payment.findMany({ // ✅ ДОБАВЛЕНО: Все платежи для дневной статистики
        where: {
          createdAt: { gte: startDate },
          gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
        },
        select: {
          amount: true,
          currency: true,
          status: true,
          amountUSDT: true,
          createdAt: true,
        },
      }),
    ]);

    let totalRevenueUSDT = 0;
    for (const payment of totalRevenue) {
      const usdtAmount = await currencyService.convertToUSDT(payment.amount, payment.currency);
      totalRevenueUSDT += usdtAmount;
    }

    // ✅ ДОБАВЛЕНО: Генерируем дневную статистику
    const dailyStats = this.generateDailyStatistics(dailyPayments, startDate, now);

    const conversionRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return {
      totalShops,
      activeShops,
      totalPayments,
      successfulPayments,
      totalRevenue: Math.round(totalRevenueUSDT * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      dailyRevenue: dailyStats.dailyRevenue, // ✅ ДОБАВЛЕНО
      dailyPayments: dailyStats.dailyPayments, // ✅ ДОБАВЛЕНО
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

    // Получаем общее количество платежей (включая неуспешные) для расчета конверсии
    const totalPaymentsWhereConditions: any = {
      gateway: { not: 'test_gateway' }, // Exclude test gateway from statistics
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Фильтр по конкретному мерчанту для общего подсчета
    if (filters.shopId) {
      totalPaymentsWhereConditions.shopId = filters.shopId;
    }

    const totalPaymentsCount = await prisma.payment.count({
      where: totalPaymentsWhereConditions,
    });

    console.log(`📊 Total payments (including failed): ${totalPaymentsCount}, successful: ${payments.length}`);

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

        // Определяем комиссию для конкретного шлюза (по умолчанию 10%)
        let gatewaySpecificSettings = {};
        let commission = 10;
        
        // Ищем настройки шлюза без учета регистра
        for (const [key, value] of Object.entries(gatewaySettings)) {
          if (key.toLowerCase() === payment.gateway.toLowerCase()) {
            gatewaySpecificSettings = value as any;
            commission = (value as any).commission || 10;
            break;
          }
        }
        
        // ✅ НОВОЕ: Используем сохраненное значение amountAfterGatewayCommissionUSDT если доступно
        let merchantAmount: number;
        let commissionAmount: number;
        
        if ((payment as any).amountAfterGatewayCommissionUSDT !== null && (payment as any).amountAfterGatewayCommissionUSDT !== undefined) {
          // Используем уже рассчитанную сумму с учетом комиссии
          merchantAmount = (payment as any).amountAfterGatewayCommissionUSDT;
          commissionAmount = amountUSDT - merchantAmount;
          console.log(`📊 Using saved amountAfterGatewayCommissionUSDT: ${merchantAmount.toFixed(6)} USDT for payment ${payment.id}`);
        } else {
          // Рассчитываем комиссию вручную (для старых платежей)
          commissionAmount = amountUSDT * (commission / 100);
          merchantAmount = amountUSDT - commissionAmount;
          console.log(`📊 Calculating commission manually for payment ${payment.id}: ${commission}% from ${amountUSDT.toFixed(6)} USDT`);
        }

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
    let pendingPayout = 0;
    if (filters.shopId) {
      // Completed payouts
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

      // Pending payouts
      const pendingPayouts = await prisma.payout.findMany({
        where: {
          shopId: filters.shopId,
          status: 'PENDING',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: { amount: true },
      });
      pendingPayout = pendingPayouts.reduce((sum, payout) => sum + payout.amount, 0);
    }

    // Рассчитываем общие метрики
    const totalPayments = totalPaymentsCount;      // Общее количество платежей (включая неуспешные)
    const successfulPayments = payments.length;    // Количество успешных платежей (PAID)
    const averageCheck = successfulPayments > 0 ? totalTurnover / successfulPayments : 0;
    const conversionRate = totalPayments > 0 ? Math.round((successfulPayments / totalPayments) * 10000) / 100 : 0;

    const daysCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const result: MerchantStatistics = {
      totalTurnover: Math.round(totalTurnover * 100) / 100,
      merchantEarnings: Math.round(merchantEarnings * 100) / 100,
      gatewayEarnings: Math.round(gatewayEarnings * 100) / 100,
      totalPaidOut: Math.round(totalPaidOut * 100) / 100,
      pendingPayout: Math.round(pendingPayout * 100) / 100,
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
    console.log(`   � Total paid out: ${result.totalPaidOut} USDT`);
    console.log(`   ⏳ Pending payout: ${result.pendingPayout} USDT`);
    console.log(`   �📊 Total payments: ${result.totalPayments}`);

    return result;
  }

  async getMerchantsSelection(): Promise<Array<{ id: string; username: string; name: string }>> {
    console.log('📋 Getting merchants selection list...');

    const merchants = await prisma.shop.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        username: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    console.log(`📋 Found ${merchants.length} active merchants for selection`);

    return merchants.map(merchant => ({
      id: merchant.id,
      username: merchant.username,
      name: merchant.name,
    }));
  }

  private getGatewayDisplayName(gatewayName: string): string {
    const gatewayDisplayNames: Record<string, string> = {
      'test_gateway': 'Test Gateway',
      'plisio': 'Plisio',
      'rapyd': 'Rapyd',
      'noda': 'Noda',
      'cointopay': 'CoinToPay',
      'cointopay2': 'Open Banking 2', // ✅ ДОБАВЛЕНО: Маппинг для CoinToPay2
      'klyme_eu': 'KLYME EU',
      'klyme_gb': 'KLYME GB',
      'klyme_de': 'KLYME DE',
      'mastercard': 'MasterCard', // ✅ ДОБАВЛЕНО: Маппинг для MasterCard
    };

    return gatewayDisplayNames[gatewayName] || gatewayName;
  }

  // ✅ ДОБАВЛЕНО: Обратный маппинг от отображаемого имени к внутреннему
  private getGatewayInternalName(displayName: string): string {
    const displayToInternal: Record<string, string> = {
      'Test Gateway': 'test_gateway',
      'Plisio': 'plisio',
      'Rapyd': 'rapyd',
      'Noda': 'noda',
      'CoinToPay': 'cointopay',
      'CoinToPay2': 'cointopay2', // ✅ ДОБАВЛЕНО: Обратный маппинг для CoinToPay2
      'KLYME EU': 'klyme_eu',
      'KLYME GB': 'klyme_gb',
      'KLYME DE': 'klyme_de',
      'MasterCard': 'mastercard', // ✅ ДОБАВЛЕНО: Обратный маппинг для MasterCard
    };

    return displayToInternal[displayName] || displayName.toLowerCase();
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
      totalPayout: number;       // ✅ НОВОЕ: Общая сумма всех выплат
      thisMonth: number;         // ✅ НОВОЕ: Выплаты за текущий месяц
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
          gatewaySettings: true,
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
              gateway: { not: 'test_gateway' }, // ✅ ИСПРАВЛЕНО: Убираем фильтр amountUSDT, добавляем исключение test_gateway
            },
          }),
          prisma.payment.findFirst({
            where: {
              shopId: merchant.id,
              status: 'PAID',
              gateway: { not: 'test_gateway' }, // ✅ ИСПРАВЛЕНО: Убираем фильтр amountUSDT, добавляем исключение test_gateway
            },
            orderBy: { paidAt: 'asc' },
            select: { paidAt: true },
          }),
          prisma.payment.groupBy({
            by: ['gateway'],
            where: {
              shopId: merchant.id,
              status: 'PAID',
              gateway: { not: 'test_gateway' }, // ✅ ИСПРАВЛЕНО: Убираем фильтр amountUSDT, добавляем исключение test_gateway
            },
            _count: { id: true },
            _sum: { amountUSDT: true },
          }),
        ]);

        // ✅ НОВОЕ: Получаем статистику выплат
        const currentDate = new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const [totalPayouts, thisMonthPayouts] = await Promise.all([
          prisma.payout.aggregate({
            _sum: { amount: true },
            where: {
              shopId: merchant.id,
              status: 'COMPLETED',
            },
          }),
          prisma.payout.aggregate({
            _sum: { amount: true },
            where: {
              shopId: merchant.id,
              status: 'COMPLETED',
              createdAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          }),
        ]);

        const totalPayout = totalPayouts._sum.amount || 0;
        const thisMonth = thisMonthPayouts._sum.amount || 0;

        const gatewayBreakdown = await Promise.all(
          gatewayStats.map(async (stat) => {
            // Получаем настройки комиссий для данного шлюза
            let commission = 10; // По умолчанию 10%
            
            if (merchant.gatewaySettings) {
              try {
                const gatewaySettings = JSON.parse(merchant.gatewaySettings);
                
                // Ищем настройки шлюза без учета регистра
                for (const [key, value] of Object.entries(gatewaySettings)) {
                  if (key.toLowerCase() === stat.gateway.toLowerCase()) {
                    commission = (value as any).commission || 10;
                    console.log(`💰 [PAYOUT] Gateway ${stat.gateway} for shop ${merchant.id}: commission = ${commission}%`);
                    break;
                  }
                }
              } catch (error) {
                console.error(`Error parsing gateway settings for shop ${merchant.id}:`, error);
              }
            }

            const amountUSDT = stat._sum?.amountUSDT || 0;
            const amountAfterCommissionUSDT = amountUSDT * (1 - commission / 100);

            return {
              gateway: stat.gateway,
              count: stat._count?.id || 0,
              amountUSDT: Math.round(amountUSDT * 100) / 100,
              amountAfterCommissionUSDT: Math.round(amountAfterCommissionUSDT * 100) / 100,
              commission: commission,
            };
          })
        );

        // ✅ ИСПРАВЛЕНО: Разделяем отображение оборота и доступного баланса
        const totalPaymentsAmount = gatewayBreakdown.reduce((sum, gateway) => sum + gateway.amountUSDT, 0);
        const actualBalance = merchant.balance;
        
        console.log(`💰 [PAYOUT] Merchant ${merchant.username}:`);
        console.log(`   � Total payments turnover: ${totalPaymentsAmount.toFixed(2)} USDT (gross revenue)`);
        console.log(`   🔍 Calculated after commission: ${gatewayBreakdown.reduce((sum, gateway) => sum + gateway.amountAfterCommissionUSDT, 0).toFixed(2)} USDT (theoretical net)`);
        console.log(`   ✅ Actual available balance: ${actualBalance.toFixed(2)} USDT (after payouts)`);

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
          totalAmountUSDT: Math.round(totalPaymentsAmount * 100) / 100,  // ✅ НОВОЕ: Общий оборот (до комиссий)
          totalAmountAfterCommissionUSDT: Math.round(actualBalance * 100) / 100,  // ✅ ИСПРАВЛЕНО: Доступный баланс
          totalPayout: Math.round(totalPayout * 100) / 100,  // ✅ НОВОЕ: Общая сумма выплат
          thisMonth: Math.round(thisMonth * 100) / 100,       // ✅ НОВОЕ: Выплаты за текущий месяц
          paymentsCount,
          oldestPaymentDate: oldestPayment?.paidAt || merchant.createdAt,
          gatewayBreakdown,
        };
      })
    );

    // ✅ ИСПРАВЛЕНО: Разделяем подсчет оборота и доступных балансов
    const totalAmountUSDT = merchantsWithStats.reduce((sum, merchant) => sum + merchant.totalAmountUSDT, 0);
    const totalAmountAfterCommissionUSDT = merchantsWithStats.reduce((sum, merchant) => sum + merchant.totalAmountAfterCommissionUSDT, 0);
    const totalPayouts = merchantsWithStats.reduce((sum, merchant) => sum + merchant.totalPayout, 0);
    const totalThisMonth = merchantsWithStats.reduce((sum, merchant) => sum + merchant.thisMonth, 0);

    console.log(`📊 Merchants awaiting payout: ${total} merchants`);
    console.log(`   💰 Total payments turnover: ${Math.round(totalAmountUSDT * 100) / 100} USDT (gross revenue)`);
    console.log(`   ✅ Total available for payout: ${Math.round(totalAmountAfterCommissionUSDT * 100) / 100} USDT (actual balances)`);
    console.log(`   💸 Total payouts (all time): ${Math.round(totalPayouts * 100) / 100} USDT`);
    console.log(`   📅 Total payouts (this month): ${Math.round(totalThisMonth * 100) / 100} USDT`);

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
        totalAmountUSDT: Math.round(totalAmountUSDT * 100) / 100,      // Общий оборот платежей
        totalAmountAfterCommissionUSDT: Math.round(totalAmountAfterCommissionUSDT * 100) / 100, // Доступные балансы
        totalPayout: Math.round(totalPayouts * 100) / 100,            // ✅ НОВОЕ: Общая сумма всех выплат
        thisMonth: Math.round(totalThisMonth * 100) / 100,            // ✅ НОВОЕ: Выплаты за текущий месяц
      },
    };
  }

  async createPayout(payoutData: CreatePayoutRequest): Promise<PayoutResponse> {
    const { shopId, amount, network, wallet, notes, txid, periodFrom, periodTo } = payoutData;

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
      if (txid) console.log(`   Transaction hash: ${txid}`);

      // Проверяем, достаточно ли средств на балансе
      if (shop.balance < amount) {
        throw new Error(`Insufficient balance. Available: ${shop.balance.toFixed(6)} USDT, Requested: ${amount.toFixed(6)} USDT`);
      }

      // ✅ НОВОЕ: Определяем адрес кошелька для выплаты
      let payoutWallet = wallet; // Если кошелек указан явно, используем его
      
      if (!payoutWallet) {
        // Если кошелек не указан, получаем его из настроек магазина
        const shopWithWallets = await tx.shop.findUnique({
          where: { id: shopId },
          select: {
            usdtPolygonWallet: true,
            usdtTrcWallet: true,
            usdtErcWallet: true,
            usdcPolygonWallet: true,
          },
        });

        if (shopWithWallets) {
          switch (network) {
            case 'polygon':
              payoutWallet = shopWithWallets.usdtPolygonWallet || undefined;
              break;
            case 'trc20':
              payoutWallet = shopWithWallets.usdtTrcWallet || undefined;
              break;
            case 'erc20':
              payoutWallet = shopWithWallets.usdtErcWallet || undefined;
              break;
            case 'polygon_usdc':
              payoutWallet = shopWithWallets.usdcPolygonWallet || undefined;
              break;
          }
        }
      }

      console.log(`💳 Payout wallet for ${network}: ${payoutWallet || 'not specified'}`);

      // Создаем выплату
      const payout = await tx.payout.create({
        data: {
          shopId,
          amount,
          network,
          // wallet: payoutWallet, // ✅ TODO: Раскомментировать после обновления Prisma Client
          status: 'COMPLETED', // Всегда COMPLETED для админских выплат
          txid, // ✅ НОВОЕ: Сохраняем хеш транзакции если указан
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
        select: {
          id: true,
          shopId: true,
          amount: true,
          network: true,
          // wallet: true, // ✅ TODO: Раскомментировать после обновления Prisma Client
          status: true,
          txid: true,
          notes: true,
          periodFrom: true,
          periodTo: true,
          createdAt: true,
          paidAt: true,
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
        // wallet: payout.wallet, // ✅ TODO: Раскомментировать после обновления Prisma Client
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
    const { page, limit, status, gateway, shopId, dateFrom, dateTo, search, currency, sortBy, sortOrder } = filters;
    const skip = (page - 1) * limit;

    console.log('📊 Getting payments with filters:', filters);

    // ✅ ОТЛАДКА: Получаем список всех уникальных gateway в системе
    const availableGateways = await prisma.payment.groupBy({
      by: ['gateway'],
      _count: { gateway: true },
    });
    console.log('📊 Available gateways in database:', availableGateways.map(g => `${g.gateway} (${g._count.gateway} payments)`));
    
    // Если запрашивается конкретный gateway, проверяем его существование
    if (gateway) {
      const requestedGatewayExists = availableGateways.some(g => g.gateway.toLowerCase() === gateway.toLowerCase());
      if (!requestedGatewayExists && gateway.toLowerCase() !== 'test_gateway') {
        console.log(`⚠️ Requested gateway '${gateway}' not found. Available gateways: ${availableGateways.map(g => g.gateway).join(', ')}`);
      }
    }

    const where: any = {};
    
    if (status) {
      where.status = status.toUpperCase();
    }

    // Always exclude test gateway from admin payments list unless specifically requested
    if (!gateway) {
      // If no specific gateway is requested, exclude test_gateway by default
      where.gateway = { not: 'test_gateway' };
    } else if (gateway && (gateway.toLowerCase() === 'test_gateway' || gateway === '0000')) {
      // If test_gateway is specifically requested (by name or ID), allow it (for debugging purposes)
      where.gateway = 'test_gateway';
    } else {
      // ✅ ИСПРАВЛЕНО: Поддерживаем как ID gateway, так и названия
      let gatewayName = gateway;
      
      // Сначала пробуем конвертировать ID в имя (например, "0010" -> "rapyd")
      const convertedFromId = getGatewayNameById(gateway);
      if (convertedFromId) {
        gatewayName = convertedFromId;
        console.log(`🔄 Converted gateway ID '${gateway}' to name '${gatewayName}'`);
      } else {
        // Если не ID, то пробуем конвертировать название в ID, а потом в имя
        // (например, "Rapyd" -> "0010" -> "rapyd")
        const gatewayIdFromName = getGatewayIdByName(gateway);
        if (gatewayIdFromName) {
          const gatewayNameFromId = getGatewayNameById(gatewayIdFromName);
          if (gatewayNameFromId) {
            gatewayName = gatewayNameFromId;
            console.log(`🔄 Converted gateway name '${gateway}' -> ID '${gatewayIdFromName}' -> name '${gatewayName}'`);
          }
        } else {
          // Если ничего не подошло, используем как есть
          console.log(`🔍 Using gateway '${gateway}' as is (not found in mappings)`);
        }
      }
      
      // Check if the requested gateway exists by doing a quick count
      const gatewayExists = await prisma.payment.count({
        where: { gateway: gatewayName.toLowerCase() },
        take: 1,
      });
      
      if (gatewayExists === 0) {
        console.log(`⚠️ Gateway '${gatewayName}' (from '${gateway}') not found in database, returning empty result`);
        // If gateway doesn't exist, use a filter that will return no results
        where.gateway = 'NONEXISTENT_GATEWAY_FILTER';
      } else {
        // Gateway exists, use the filter
        where.gateway = gatewayName.toLowerCase();
        console.log(`✅ Using gateway filter: '${gatewayName}' (from '${gateway}')`);
      }
    }

    console.log('📊 Gateway filter applied:', where.gateway);

    if (shopId) {
      where.shopId = shopId;
    }

    // ✅ НОВОЕ: Фильтр по валюте
    if (currency) {
      where.currency = currency.toUpperCase();
      console.log(`💱 Currency filter applied: ${currency.toUpperCase()}`);
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
        { id: { contains: search, mode: 'insensitive' } }, // ✅ ДОБАВЛЕНО: Поиск по ID платежа
        { orderId: { contains: search, mode: 'insensitive' } },
        { gatewayOrderId: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { shop: { name: { contains: search, mode: 'insensitive' } } },
        { shop: { username: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // ✅ ОТЛАДКА: Показываем финальные условия фильтрации
    console.log('📊 Final WHERE conditions:', JSON.stringify(where, null, 2));

    // ✅ НОВОЕ: Настройка сортировки
    let orderBy: any = { createdAt: 'desc' }; // По умолчанию сортируем по дате создания

    if (sortBy) {
      const validSortFields = ['amount', 'createdAt', 'updatedAt', 'status', 'gateway', 'currency'];
      const validSortOrders = ['asc', 'desc'];
      
      if (validSortFields.includes(sortBy)) {
        const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';
        orderBy = { [sortBy]: order };
        
        console.log(`📊 Sorting payments by ${sortBy} in ${order} order`);
      }
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: orderBy,
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
      payments: payments,
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

      // ✅ ИСПРАВЛЕНО: Логика обновления баланса мерчанта с учетом комиссий
      let balanceChange = 0;
      let newShopBalance = currentPayment.shop.balance;

      // Переход в статус PAID
      if (newStatus === 'PAID' && oldStatus !== 'PAID') {
        updateData.paidAt = new Date();
        
        // Конвертируем сумму в USDT
        const amountUSDT = await currencyService.convertToUSDT(currentPayment.amount, currentPayment.currency);
        updateData.amountUSDT = amountUSDT;
        
        // ✅ ИСПРАВЛЕНО: Получаем настройки комиссий и вычисляем сумму после комиссии
        let commission = 10; // По умолчанию 10%
        
        // Получаем настройки магазина
        const shopWithSettings = await tx.shop.findUnique({
          where: { id: currentPayment.shopId },
          select: { gatewaySettings: true },
        });
        
        if (shopWithSettings?.gatewaySettings) {
          try {
            const gatewaySettings = JSON.parse(shopWithSettings.gatewaySettings);
            
            // Ищем настройки шлюза без учета регистра
            for (const [key, value] of Object.entries(gatewaySettings)) {
              if (key.toLowerCase() === currentPayment.gateway.toLowerCase()) {
                commission = (value as any).commission || 10;
                break;
              }
            }
          } catch (error) {
            console.error(`Error parsing gateway settings for payment ${id}:`, error);
          }
        }
        
        // ✅ НОВОЕ: Используем сохраненное значение amountAfterGatewayCommissionUSDT если доступно
        let merchantAmount: number;
        
        if ((currentPayment as any).amountAfterGatewayCommissionUSDT !== null && (currentPayment as any).amountAfterGatewayCommissionUSDT !== undefined) {
          // Используем уже рассчитанную сумму с учетом комиссии
          merchantAmount = (currentPayment as any).amountAfterGatewayCommissionUSDT;
          console.log(`📊 [ADMIN] Using saved amountAfterGatewayCommissionUSDT: ${merchantAmount.toFixed(6)} USDT for payment ${id}`);
        } else {
          // Рассчитываем комиссию вручную (для старых платежей)
          merchantAmount = amountUSDT * (1 - commission / 100);
          console.log(`📊 [ADMIN] Calculating commission manually for payment ${id}: ${commission}% from ${amountUSDT.toFixed(6)} USDT`);
          
          // ✅ НОВОЕ: Сохраняем рассчитанную сумму с учетом комиссии шлюза
          updateData.amountAfterGatewayCommissionUSDT = merchantAmount;
        }
        
        balanceChange = merchantAmount;
        newShopBalance += merchantAmount;
        
        console.log(`💰 Payment ${id} became PAID:`);
        console.log(`   Full amount: ${amountUSDT.toFixed(6)} USDT`);
        console.log(`   Gateway: ${currentPayment.gateway}, Commission: ${commission}%`);
        console.log(`   Merchant gets: ${merchantAmount.toFixed(6)} USDT (after ${commission}% commission)`);
        console.log(`   Added to balance: +${merchantAmount.toFixed(6)} USDT`);
      }
      
      // Переход из статуса PAID
      else if (oldStatus === 'PAID' && newStatus !== 'PAID') {
        if (currentPayment.amountUSDT) {
          // ✅ ИСПРАВЛЕНО: При отмене PAID статуса, вычитаем сумму с учетом комиссии
          let commission = 10; // По умолчанию 10%
          
          // Получаем настройки магазина
          const shopWithSettings = await tx.shop.findUnique({
            where: { id: currentPayment.shopId },
            select: { gatewaySettings: true },
          });
          
          if (shopWithSettings?.gatewaySettings) {
            try {
              const gatewaySettings = JSON.parse(shopWithSettings.gatewaySettings);
              
              // Ищем настройки шлюза без учета регистра
              for (const [key, value] of Object.entries(gatewaySettings)) {
                if (key.toLowerCase() === currentPayment.gateway.toLowerCase()) {
                  commission = (value as any).commission || 10;
                  break;
                }
              }
            } catch (error) {
              console.error(`Error parsing gateway settings for payment ${id}:`, error);
            }
          }
          
          // ✅ ИСПРАВЛЕНО: Используем сохраненную сумму после комиссии или вычисляем
          // TODO: После миграции добавить поле amountAfterGatewayCommissionUSDT
          const merchantAmount = /* currentPayment.amountAfterGatewayCommissionUSDT || */ 
                                currentPayment.amountUSDT * (1 - commission / 100);
          balanceChange = -merchantAmount;
          newShopBalance -= merchantAmount;
          updateData.amountUSDT = null;
          updateData.amountAfterGatewayCommissionUSDT = null;
          
          console.log(`💰 Payment ${id} no longer PAID:`);
          console.log(`   Full amount: ${currentPayment.amountUSDT.toFixed(6)} USDT`);
          console.log(`   Gateway: ${currentPayment.gateway}, Commission: ${commission}%`);
          console.log(`   Merchant loses: ${merchantAmount.toFixed(6)} USDT (after ${commission}% commission)`);
          console.log(`   Subtracted from balance: -${merchantAmount.toFixed(6)} USDT`);
        }
      }
      
      // Специальная обработка CHARGEBACK
      if (newStatus === 'CHARGEBACK') {
        if (oldStatus === 'PAID' && currentPayment.amountUSDT) {
          // ✅ ИСПРАВЛЕНО: При CHARGEBACK логика вычета суммы уже обработана выше
          console.log(`💸 CHARGEBACK: Merchant amount already deducted from balance`);
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
    const callId = Math.random().toString(36).substr(2, 9);
    console.log(`🎯 updateUser called with ID: ${callId}, userId: ${id}`);
    
    const updatePayload: any = { ...updateData };

    // ✅ ОБНОВЛЕНО: Обновляем пароль только если он передан и не пустой
    if (updateData.password && updateData.password.trim() !== '') {
      console.log(`🔐 [${callId}] Updating password for user ${id}`);
      updatePayload.password = await bcrypt.hash(updateData.password, 12);
    } else {
      console.log(`🔐 [${callId}] Password not provided or empty, skipping password update`);
      // Удаляем поле password из updatePayload, чтобы оно не попало в базу данных
      delete updatePayload.password;
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
      // ✅ ДОБАВЛЕНО: Преобразование отображаемых имен в внутренние имена
      const internalGateways = updateData.gateways.map(gateway => this.getGatewayInternalName(gateway));
      console.log(`🔄 Gateway mapping:`, updateData.gateways, '->', internalGateways);
      updatePayload.paymentGateways = JSON.stringify(internalGateways);
      delete updatePayload.gateways;
    }

    if (updateData.gatewaySettings) {
      console.log(`🔧 [${callId}] Gateway settings before saving:`, updateData.gatewaySettings);
      updatePayload.gatewaySettings = JSON.stringify(updateData.gatewaySettings);
      console.log(`🔧 [${callId}] Gateway settings JSON string:`, updatePayload.gatewaySettings);
      // ✅ ИСПРАВЛЕНО: НЕ удаляем gatewaySettings из updatePayload! Это поле должно попасть в базу данных
      // delete updatePayload.gatewaySettings;
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

    console.log(`🎯 [${callId}] User updated, gatewaySettings from DB:`, updatedUser.gatewaySettings);

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
      users: users.map(user => {
        // ✅ ДОБАВЛЕНО: Преобразование внутренних имен gateway'ев в отображаемые имена
        const internalGateways = user.paymentGateways ? JSON.parse(user.paymentGateways) : null;
        const displayGateways = internalGateways ? internalGateways.map((gateway: string) => this.getGatewayDisplayName(gateway)) : null;
        
        return {
          id: user.id,
          fullName: user.name,
          username: user.username,
          telegramId: user.telegram,
          merchantUrl: user.shopUrl,
          gateways: displayGateways,
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
      }),
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

    // ✅ ДОБАВЛЕНО: Преобразование внутренних имен gateway'ев в отображаемые имена
    const internalGateways = user.paymentGateways ? JSON.parse(user.paymentGateways) : null;
    const displayGateways = internalGateways ? internalGateways.map((gateway: string) => this.getGatewayDisplayName(gateway)) : null;
    
    if (internalGateways && displayGateways) {
      console.log(`🔄 Gateway mapping (get):`, internalGateways, '->', displayGateways);
    }

    return {
      id: user.id,
      fullName: user.name,
      username: user.username,
      telegramId: user.telegram,
      merchantUrl: user.shopUrl,
      gateways: displayGateways,
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

    // ✅ ДОБАВЛЕНО: Преобразование отображаемых имен gateway'ев в внутренние имена
    const internalGateways = gateways ? gateways.map(gateway => this.getGatewayInternalName(gateway)) : null;
    if (gateways && internalGateways) {
      console.log(`🔄 Gateway mapping (create):`, gateways, '->', internalGateways);
    }

    const newUser = await prisma.shop.create({
      data: {
        name: fullName,
        username,
        password: hashedPassword,
        telegram: telegramId,
        shopUrl: merchantUrl,
        paymentGateways: internalGateways ? JSON.stringify(internalGateways) : null,
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

  // ✅ ДОБАВЛЕНО: Helper method to generate daily statistics (скопировано из shopService)
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
        if (payment.status === 'PAID') {
          if (payment.amountUSDT) {
            // Use cached USDT amount if available
            dayData.revenue += payment.amountUSDT;
          } else {
            // Fallback for old payments without amountUSDT (это может быть медленно, но нужно)
            // В реальности лучше запустить миграцию для пересчета всех amountUSDT
            console.log(`⚠️ Payment ${payment.id} missing amountUSDT, using fallback conversion`);
          }
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