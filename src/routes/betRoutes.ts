import express from 'express';
import { body } from 'express-validator';
import betController from '../controllers/betController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para usuarios
router.post(
  '/',
  [
    body('stakeAmount').isNumeric().toFloat().isFloat({ min: 1 }),
    body('selections').isArray({ min: 1 }),
    body('selections.*.oddsId').isInt().toInt()
  ],
  betController.placeBet
);

router.get('/', betController.getUserBets);
router.get('/:id', betController.getTicketById);

// Rutas para administradores
router.get('/admin/all', authorizeAdmin, betController.getAllBets);
router.put(
  '/admin/:id/status',
  authorizeAdmin,
  [
    body('status').isIn(['pending', 'won', 'lost', 'canceled'])
  ],
  betController.updateTicketStatus
);

export default router;