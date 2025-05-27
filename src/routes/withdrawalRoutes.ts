import express from 'express';
import { body } from 'express-validator';
import withdrawalController from '../controllers/withdrawalController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para el usuario
router.post(
  '/',
  [
    body('amount').isNumeric().toFloat().isFloat({ min: 1 }),
    body('method').isIn(['mobile_payment', 'binance']),
    body('bank_detail_id').optional().isInt(),
    body('crypto_detail_id').optional().isInt(),
  ],
  withdrawalController.createWithdrawal
);

router.get('/', withdrawalController.getUserWithdrawals);

// Rutas para administrador
router.get('/admin/all', authorizeAdmin, withdrawalController.getAllWithdrawals);

router.put(
  '/admin/:id/status',
  authorizeAdmin,
  [
    body('status').isIn(['pending', 'completed', 'rejected'])
  ],
  withdrawalController.updateWithdrawalStatus
);

export default router;