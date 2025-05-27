import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import authService from '../services/authService';
import { AppError } from '../middlewares/errorHandler';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Validar entrada
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de registro inválidos', 400);
      }

      const { user, token } = await authService.register(req.body);
      
      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: { user, token }
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      // Validar entrada
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de inicio de sesión inválidos', 400);
      }

      const { username, password } = req.body;
      const { user, token } = await authService.login(username, password);
      
      res.status(200).json({
        success: true,
        message: 'Inicio de sesión exitoso',
        data: { user, token }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();