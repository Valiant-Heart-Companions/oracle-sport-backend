import express from 'express';
import { body } from 'express-validator';
import userController from '../controllers/userController';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para el perfil del usuario
router.get('/profile', userController.getProfile);
router.put(
  '/profile',
  [
    body('first_name').optional().isString().notEmpty(),
    body('last_name').optional().isString().notEmpty(),
    body('email').optional().isEmail(),
    body('phone').optional().isString().notEmpty(),
    body('country').optional().isString().notEmpty(),
  ],
  userController.updateProfile
);

router.put(
  '/change-password',
  [
    body('current_password').isString().notEmpty(),
    body('new_password').isString().isLength({ min: 6 }),
  ],
  userController.changePassword
);

// Rutas para administrar detalles bancarios
router.get('/bank-details', userController.getBankDetails);
router.post(
  '/bank-details',
  [
    body('bank_name').isString().notEmpty(),
    body('account_number').isString().notEmpty(),
    body('registered_phone').isString().notEmpty(),
  ],
  userController.addBankDetail
);
router.put(
  '/bank-details/:id',
  [
    body('bank_name').optional().isString().notEmpty(),
    body('account_number').optional().isString().notEmpty(),
    body('registered_phone').optional().isString().notEmpty(),
  ],
  userController.updateBankDetail
);
router.delete('/bank-details/:id', userController.deleteBankDetail);

// Rutas para administrar detalles de criptomonedas
router.get('/crypto-details', userController.getCryptoDetails);
router.post(
  '/crypto-details',
  [
    body('wallet_address').isString().notEmpty(),
    body('network').isString().notEmpty(),
  ],
  userController.addCryptoDetail
);
router.put(
  '/crypto-details/:id',
  [
    body('wallet_address').optional().isString().notEmpty(),
    body('network').optional().isString().notEmpty(),
  ],
  userController.updateCryptoDetail
);
router.delete('/crypto-details/:id', userController.deleteCryptoDetail);

// Rutas administrativas (requieren rol de admin)
router.get('/admin/users', authorizeAdmin, userController.getAllUsers);
router.get('/admin/users/:id', authorizeAdmin, userController.getUserById);
router.put(
  '/admin/users/:id',
  authorizeAdmin,
  [
    body('role').optional().isIn(['user', 'admin']),
    body('balance').optional().isNumeric(),
  ],
  userController.updateUserByAdmin
);
router.delete('/admin/users/:id', authorizeAdmin, userController.deleteUser);

export default router;