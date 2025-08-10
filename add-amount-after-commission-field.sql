-- Добавление поля amountAfterGatewayCommissionUSDT в таблицу payments
-- Это поле будет хранить сумму в USDT с учетом комиссии шлюза

ALTER TABLE payments 
ADD COLUMN amount_after_gateway_commission_usdt DECIMAL(20,8);

-- Добавляем комментарий к полю
COMMENT ON COLUMN payments.amount_after_gateway_commission_usdt IS 'Сумма в USDT с учетом комиссии шлюза';

-- Опционально: можно заполнить существующие записи расчетной суммой
-- UPDATE payments 
-- SET amount_after_gateway_commission_usdt = amount_usdt * 0.9 
-- WHERE status = 'PAID' AND amount_usdt IS NOT NULL;
