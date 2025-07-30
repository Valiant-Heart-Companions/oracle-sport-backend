import express from 'express';
import { body, query } from 'express-validator';
import ticketController from '../controllers/ticketController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para usuarios
router.post(
  '/',
  [
    body('stake_amount')
      .isNumeric()
      .toFloat()
      .isFloat({ min: 1 })
      .withMessage('El monto de la apuesta debe ser mayor a 0'),
    body('selections')
      .isArray({ min: 1 })
      .withMessage('Debe incluir al menos una selección'),
    body('selections.*.event_id')
      .isInt({ min: 1 })
      .withMessage('ID de evento inválido'),
    body('selections.*.odds_id')
      .isInt({ min: 1 })
      .withMessage('ID de cuota inválido'),
    body('selections.*.selection')
      .isString()
      .notEmpty()
      .withMessage('Descripción de selección requerida'),
    body('selections.*.odds_value')
      .isNumeric()
      .toFloat()
      .isFloat({ min: 1 })
      .withMessage('Valor de cuota inválido')
  ],
  ticketController.createTicket
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('status').optional().isIn(['pending', 'won', 'lost', 'canceled']).withMessage('Estado inválido')
  ],
  ticketController.getUserTickets
);

router.get('/statistics', ticketController.getUserTicketStatistics);

router.get('/:id', ticketController.getUserTicketById);

// Rutas administrativas
router.get(
  '/admin/all',
  authorizeAdmin,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
    query('status').optional().isIn(['pending', 'won', 'lost', 'canceled']).withMessage('Estado inválido'),
    query('username').optional().isString().withMessage('Nombre de usuario inválido'),
    query('dateFrom').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('dateTo').optional().isISO8601().withMessage('Fecha hasta inválida')
  ],
  ticketController.getAllTickets
);

router.get('/admin/statistics', authorizeAdmin, ticketController.getTicketStatistics);

router.get('/admin/recent', authorizeAdmin, ticketController.getRecentTickets);

router.get('/admin/:id', authorizeAdmin, ticketController.getTicketById);

router.put(
  '/admin/:id/status',
  authorizeAdmin,
  [
    body('status')
      .isIn(['pending', 'won', 'lost', 'canceled'])
      .withMessage('Estado inválido')
  ],
  ticketController.updateTicketStatus
);

router.delete('/admin/:id', authorizeAdmin, ticketController.deleteTicket);

export default router;