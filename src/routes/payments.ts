import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { validate, createPublicPaymentSchema, masterCardPaymentSchema, updateCustomerDataSchema } from '../middleware/validation';
import { authenticateToken, requireShop } from '../middleware/auth';

const router = Router();
const paymentController = new PaymentController();

// Public payment creation route (requires public_key instead of auth)
router.post('/create', validate(createPublicPaymentSchema), paymentController.createPublicPayment);

// Public payment status route
router.get('/:id/status', paymentController.getPaymentStatus);

// ✅ НОВОЕ: Обновление данных клиента платежа (публичный роут)
router.put('/:id/customer', validate(updateCustomerDataSchema), paymentController.updatePaymentCustomer);

// New route to get payment by ID (either our ID or shop's order ID)
router.get('/:id', paymentController.getPaymentById);

// ✅ НОВОЕ: MasterCard card processing endpoint
router.post('/:id/process-mastercard', validate(masterCardPaymentSchema), paymentController.processMasterCardPayment);
export default router;