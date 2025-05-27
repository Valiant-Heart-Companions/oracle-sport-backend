import express from 'express';
import { body } from 'express-validator';
import depositController from '../controllers/depositController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para el usuario
router.post(
  '/',
  [
    body('amount').isNumeric().toFloat().isFloat({ min: 1 }),
    body('method').isIn(['bank_transfer', 'mobile_payment', 'binance']),
    body('reference_number').optional().isString(),
    body('transaction_hash').optional().isString(),
    body('deposit_date').isISO8601().toDate()
  ],
  depositController.createDeposit
);

router.get('/', depositController.getUserDeposits);

// Rutas para administrador
router.get('/admin/all', authorizeAdmin, depositController.getAllDeposits);

router.put(
  '/admin/:id/status',
  authorizeAdmin,
  [
    body('status').isIn(['pending', 'completed', 'rejected'])
  ],
  depositController.updateDepositStatus
);

export default router;