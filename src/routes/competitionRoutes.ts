import express from 'express';
import { body, query } from 'express-validator';
import competitionController from '../controllers/competitionController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Rutas públicas
router.get('/', competitionController.getCompetitions);
router.get('/stats', competitionController.getCompetitionsWithStats);
router.get('/sport/:sportId', competitionController.getCompetitionsBySport);
router.get('/:id', competitionController.getCompetitionById);

// Rutas administrativas (requieren autenticación y rol de admin)
router.post(
  '/',
  authenticateToken,
  authorizeAdmin,
  [
    body('sport_id').isInt({ min: 1 }).withMessage('ID de deporte inválido'),
    body('name').isString().notEmpty().withMessage('Nombre de competición requerido'),
    body('country').isString().notEmpty().withMessage('País requerido'),
    body('active').optional().isBoolean().withMessage('Estado activo debe ser booleano')
  ],
  competitionController.createCompetition
);

router.put(
  '/:id',
  authenticateToken,
  authorizeAdmin,
  [
    body('sport_id').optional().isInt({ min: 1 }).withMessage('ID de deporte inválido'),
    body('name').optional().isString().notEmpty().withMessage('Nombre de competición inválido'),
    body('country').optional().isString().notEmpty().withMessage('País inválido'),
    body('active').optional().isBoolean().withMessage('Estado activo debe ser booleano')
  ],
  competitionController.updateCompetition
);

router.patch(
  '/:id/toggle',
  authenticateToken,
  authorizeAdmin,
  competitionController.toggleCompetitionStatus
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeAdmin,
  competitionController.deleteCompetition
);

export default router;