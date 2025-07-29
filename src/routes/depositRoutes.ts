import express from 'express';
import { body, query } from 'express-validator';
import depositController from '../controllers/depositController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para el usuario
router.post(
  '/',
  [
    body('amount')
      .isNumeric()
      .toFloat()
      .isFloat({ min: 1 })
      .withMessage('El monto debe ser mayor a 0'),
    body('method')
      .isIn(['bank_transfer', 'mobile_payment', 'binance'])
      .withMessage('Método de depósito inválido'),
    body('reference_number')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Número de referencia inválido'),
    body('transaction_hash')
      .optional()
      .isString()
      .isLength({ min: 1, max: 255 })
      .withMessage('Hash de transacción inválido'),
    body('deposit_date')
      .isISO8601()
      .toDate()
      .withMessage('Fecha de depósito inválida')
  ],
  depositController.createDeposit
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('status').optional().isIn(['pending', 'completed', 'rejected']).withMessage('Estado inválido')
  ],
  depositController.getUserDeposits
);

router.get('/statistics', depositController.getUserDepositStatistics);

router.get(
  '/:id',
  [
    query('id').isInt({ min: 1 }).withMessage('ID debe ser un número mayor a 0')
  ],
  depositController.getUserDepositById
);

// Rutas administrativas
router.get(
  '/admin/all',
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('status').optional().isIn(['pending', 'completed', 'rejected']).withMessage('Estado inválido'),
    query('method').optional().isIn(['bank_transfer', 'mobile_payment', 'binance']).withMessage('Método inválido'),
    query('username').optional().isString().withMessage('Nombre de usuario inválido'),
    query('dateFrom').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('dateTo').optional().isISO8601().withMessage('Fecha hasta inválida')
  ],
  depositController.getAllDeposits
);

router.get('/admin/statistics', authorizeAdmin, depositController.getDepositStatistics);

router.get('/admin/recent', authorizeAdmin, depositController.getRecentDeposits);

router.get('/admin/:id', authorizeAdmin, depositController.getDepositById);

router.put(
  '/admin/:id/status',
  authorizeAdmin,
  [
    body('status')
      .isIn(['pending', 'completed', 'rejected'])
      .withMessage('Estado inválido')
  ],
  depositController.updateDepositStatus
);

router.put(
  '/admin/:id',
  authorizeAdmin,
  [
    body('amount')
      .optional()
      .isNumeric()
      .toFloat()
      .isFloat({ min: 1 })
      .withMessage('El monto debe ser mayor a 0'),
    body('method')
      .optional()
      .isIn(['bank_transfer', 'mobile_payment', 'binance'])
      .withMessage('Método de depósito inválido'),
    body('reference_number')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Número de referencia inválido'),
    body('transaction_hash')
      .optional()
      .isString()
      .isLength({ min: 1, max: 255 })
      .withMessage('Hash de transacción inválido'),
    body('deposit_date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Fecha de depósito inválida')
  ],
  depositController.updateDeposit
);

router.delete('/admin/:id', authorizeAdmin, depositController.deleteDeposit);

export default router;