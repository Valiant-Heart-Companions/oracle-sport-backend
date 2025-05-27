import express from 'express';
import { body } from 'express-validator';
import authController from '../controllers/authController';

const router = express.Router();

// Ruta de registro
router.post(
  '/register',
  [
    body('username').isString().isLength({ min: 4, max: 50 }),
    body('password').isString().isLength({ min: 6 }),
    body('first_name').isString().notEmpty(),
    body('last_name').isString().notEmpty(),
    body('identification_number').isString().notEmpty(),
    body('email').isEmail(),
    body('phone').isString().notEmpty(),
    body('country').isString().notEmpty()
  ],
  authController.register
);

// Ruta de inicio de sesión
router.post(
  '/login',
  [
    body('username').isString().notEmpty(),
    body('password').isString().notEmpty()
  ],
  authController.login
);

export default router;