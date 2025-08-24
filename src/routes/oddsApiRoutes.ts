import express from 'express';
import { param } from 'express-validator';
import oddsApiController from '../controllers/oddsApiController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Rutas públicas
router.get('/sports', oddsApiController.getSports);
router.get('/events/:sportKey', oddsApiController.getEventsBySport);

// Rutas administrativas
router.post('/sync/all', 
  //authenticateToken, 
//  authorizeAdmin, 
  oddsApiController.syncAllMainSports
);

router.get('/usage', 
  authenticateToken, 
  authorizeAdmin, 
  oddsApiController.getApiUsage
);

router.post('/validate/:apiEventId',
  authenticateToken,
  [
    param('apiEventId').isString().notEmpty().withMessage('API Event ID inválido')
  ],
  oddsApiController.validateEvent
);

export default router;