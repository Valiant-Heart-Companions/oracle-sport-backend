import express from 'express';
import { body } from 'express-validator';
import sportController from '../controllers/sportController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Rutas públicas
router.get('/', sportController.getSports);
router.get('/main', sportController.getMainSports);
router.get('/stats', sportController.getSportsWithStats);
router.get('/:id', sportController.getSportById);
router.get('/api-key/:apiKey', sportController.getSportByApiKey);

// Rutas administrativas (requieren autenticación y rol de admin)
router.post(
  '/',
  authenticateToken,
  authorizeAdmin,
  [
    body('api_sport_key').isString().notEmpty(),
    body('name').isString().notEmpty(),
    body('group_name').isString().notEmpty(),
    body('description').optional().isString(),
    body('active').optional().isBoolean()
  ],
  sportController.createSport
);

router.put(
  '/:id',
  authenticateToken,
  authorizeAdmin,
  [
    body('api_sport_key').optional().isString().notEmpty(),
    body('name').optional().isString().notEmpty(),
    body('group_name').optional().isString().notEmpty(),
    body('description').optional().isString(),
    body('active').optional().isBoolean()
  ],
  sportController.updateSport
);

router.patch(
  '/:id/toggle',
  authenticateToken,
  authorizeAdmin,
  sportController.toggleSportStatus
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeAdmin,
  sportController.deleteSport
);

// Rutas de sincronización
router.post(
  '/sync',
  authenticateToken,
  authorizeAdmin,
  sportController.syncSports
);

router.post(
  '/sync/:apiKey',
  authenticateToken,
  authorizeAdmin,
  sportController.syncSportEvents
);

// Rutas de estadísticas
router.get(
  '/:id/statistics',
  authenticateToken,
  authorizeAdmin,
  sportController.getSportStatistics
);

export default router;