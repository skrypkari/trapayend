import { Router } from 'express';
import { TestGatewayController } from '../controllers/testGatewayController';
import { validate, cardPaymentSchema } from '../middleware/validation';

const router = Router();
const testGatewayController = new TestGatewayController();

// CORS handling for test gateway
router.options('*', (req, res) => {
  console.log(`📋 Test Gateway OPTIONS request to: ${req.originalUrl}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.status(200).json({
    success: true,
    message: 'Test Gateway CORS preflight successful',
    endpoint: req.originalUrl,
  });
});

// Test gateway card processing endpoint
router.post('/process-card/:paymentId', validate(cardPaymentSchema), testGatewayController.processCard);

// Test gateway payment form endpoint (returns payment details for form)
router.get('/payment/:paymentId', testGatewayController.getPaymentForm);

export default router;