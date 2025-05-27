import express from 'express';
import eventController from '../controllers/eventController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Rutas públicas
router.get('/', eventController.getEvents);
router.get('/:id', eventController.getEventById);

// Rutas administrativas (protegidas)
router.post(
  '/refresh',
  authenticateToken,
  authorizeAdmin,
  eventController.refreshEvents
);

export default router;