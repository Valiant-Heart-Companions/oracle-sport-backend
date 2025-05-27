import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user';
import { BankDetailModel } from '../models/bankDetail';
import { CryptoDetailModel } from '../models/cryptoDetail';
import { AppError } from '../middlewares/errorHandler';
import pool from '../config/database';

const userModel = new UserModel();
const bankDetailModel = new BankDetailModel();
const cryptoDetailModel = new CryptoDetailModel();

class UserController {
  // Obtener perfil del usuario autenticado
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const user = await userModel.findById(userId);
      
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      // No devolver la contraseña
      const { password, ...userWithoutPassword } = user;
      
      res.status(200).json({
        success: true,
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar perfil del usuario
  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de perfil inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { first_name, last_name, email, phone, country } = req.body;
      
      // Verificar que el correo no esté en uso por otro usuario
      if (email) {
        const existingUser = await userModel.findByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          throw new AppError('El correo electrónico ya está en uso', 400);
        }
      }
      
      const updatedUser = await userModel.update(userId, {
        first_name,
        last_name,
        email,
        phone,
        country
      });
      
      if (!updatedUser) {
        throw new AppError('No se pudo actualizar el perfil', 500);
      }
      
      // No devolver la contraseña
      const { password, ...userWithoutPassword } = updatedUser;
      
      res.status(200).json({
        success: true,
        message: 'Perfil actualizado correctamente',
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Cambiar contraseña
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de cambio de contraseña inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { current_password, new_password } = req.body;
      
      // Obtener usuario actual
      const user = await userModel.findById(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      // Verificar contraseña actual
      const isPasswordValid = await userModel.comparePassword(
        current_password, 
        user.password
      );
      
      if (!isPasswordValid) {
        throw new AppError('Contraseña actual incorrecta', 400);
      }
      
      // Actualizar contraseña
      const updatedUser = await userModel.update(userId, {
        password: new_password
      });
      
      if (!updatedUser) {
        throw new AppError('No se pudo actualizar la contraseña', 500);
      }
      
      res.status(200).json({
        success: true,
        message: 'Contraseña actualizada correctamente'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener detalles bancarios del usuario
  async getBankDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const bankDetails = await bankDetailModel.findByUserId(userId);
      
      res.status(200).json({
        success: true,
        data: bankDetails
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Añadir detalle bancario
  async addBankDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos bancarios inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { bank_name, account_number, registered_phone } = req.body;
      
      const newBankDetail = await bankDetailModel.create({
        user_id: userId,
        bank_name,
        account_number,
        registered_phone
      });
      
      res.status(201).json({
        success: true,
        message: 'Datos bancarios añadidos correctamente',
        data: newBankDetail
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar detalle bancario
  async updateBankDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos bancarios inválidos', 400);
      }
      
      const userId = req.user!.id;
      const bankDetailId = parseInt(req.params.id);
      const { bank_name, account_number, registered_phone } = req.body;
      
      // Verificar que el detalle bancario pertenece al usuario
      const existingDetail = await bankDetailModel.findById(bankDetailId);
      if (!existingDetail) {
        throw new AppError('Detalle bancario no encontrado', 404);
      }
      
      if (existingDetail.user_id !== userId) {
        throw new AppError('No autorizado para modificar este detalle bancario', 403);
      }
      
      const updatedBankDetail = await bankDetailModel.update(bankDetailId, {
        bank_name,
        account_number,
        registered_phone
      });
      
      res.status(200).json({
        success: true,
        message: 'Datos bancarios actualizados correctamente',
        data: updatedBankDetail
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar detalle bancario
  async deleteBankDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const bankDetailId = parseInt(req.params.id);
      
      // Verificar que el detalle bancario pertenece al usuario
      const existingDetail = await bankDetailModel.findById(bankDetailId);
      if (!existingDetail) {
        throw new AppError('Detalle bancario no encontrado', 404);
      }
      
      if (existingDetail.user_id !== userId) {
        throw new AppError('No autorizado para eliminar este detalle bancario', 403);
      }
      
      const deleted = await bankDetailModel.delete(bankDetailId);
      
      if (!deleted) {
        throw new AppError('No se pudo eliminar el detalle bancario', 500);
      }
      
      res.status(200).json({
        success: true,
        message: 'Detalle bancario eliminado correctamente'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener detalles de criptomonedas del usuario
  async getCryptoDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const cryptoDetails = await cryptoDetailModel.findByUserId(userId);
      
      res.status(200).json({
        success: true,
        data: cryptoDetails
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Añadir detalle de criptomoneda
  async addCryptoDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de criptomoneda inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { wallet_address, network } = req.body;
      
      const newCryptoDetail = await cryptoDetailModel.create({
        user_id: userId,
        wallet_address,
        network
      });
      
      res.status(201).json({
        success: true,
        message: 'Datos de criptomoneda añadidos correctamente',
        data: newCryptoDetail
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar detalle de criptomoneda
  async updateCryptoDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de criptomoneda inválidos', 400);
      }
      
      const userId = req.user!.id;
      const cryptoDetailId = parseInt(req.params.id);
      const { wallet_address, network } = req.body;
      
      // Verificar que el detalle de criptomoneda pertenece al usuario
      const existingDetail = await cryptoDetailModel.findById(cryptoDetailId);
      if (!existingDetail) {
        throw new AppError('Detalle de criptomoneda no encontrado', 404);
      }
      
      if (existingDetail.user_id !== userId) {
        throw new AppError('No autorizado para modificar este detalle de criptomoneda', 403);
      }
      
      const updatedCryptoDetail = await cryptoDetailModel.update(cryptoDetailId, {
        wallet_address,
        network
      });
      
      res.status(200).json({
        success: true,
        message: 'Datos de criptomoneda actualizados correctamente',
        data: updatedCryptoDetail
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar detalle de criptomoneda
  async deleteCryptoDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const cryptoDetailId = parseInt(req.params.id);
      
      // Verificar que el detalle de criptomoneda pertenece al usuario
      const existingDetail = await cryptoDetailModel.findById(cryptoDetailId);
      if (!existingDetail) {
        throw new AppError('Detalle de criptomoneda no encontrado', 404);
      }
      
      if (existingDetail.user_id !== userId) {
        throw new AppError('No autorizado para eliminar este detalle de criptomoneda', 403);
      }
      
      const deleted = await cryptoDetailModel.delete(cryptoDetailId);
      
      if (!deleted) {
        throw new AppError('No se pudo eliminar el detalle de criptomoneda', 500);
      }
      
      res.status(200).json({
        success: true,
        message: 'Detalle de criptomoneda eliminado correctamente'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // RUTAS ADMINISTRATIVAS
  
  // Obtener todos los usuarios (solo admin)
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      
      const { users, total } = await userModel.getAll(page, limit);
      
      // No devolver contraseñas
      const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.status(200).json({
        success: true,
        data: {
          users: usersWithoutPasswords,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener usuario por ID (solo admin)
  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const user = await userModel.findById(userId);
      
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      // No devolver la contraseña
      const { password, ...userWithoutPassword } = user;
      
      res.status(200).json({
        success: true,
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar usuario por admin
  async updateUserByAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de usuario inválidos', 400);
      }
      
      const userId = parseInt(req.params.id);
      const { role, balance } = req.body;
      
      // Verificar que el usuario existe
      const existingUser = await userModel.findById(userId);
      if (!existingUser) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      // Actualizar rol si se proporciona
      if (role) {
        await pool.query(
          'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
          [role, userId]
        );
      }
      
      // Actualizar saldo si se proporciona
      if (balance !== undefined) {
        await pool.query(
          'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
          [balance, userId]
        );
      }
      
      const updatedUser = await userModel.findById(userId);
      
      // No devolver la contraseña
      const { password, ...userWithoutPassword } = updatedUser!;
      
      res.status(200).json({
        success: true,
        message: 'Usuario actualizado correctamente',
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar usuario (solo admin)
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      
      // No permitir eliminar al propio usuario administrador
      if (userId === req.user!.id) {
        throw new AppError('No puedes eliminar tu propia cuenta', 400);
      }
      
      const deleted = await userModel.delete(userId);
      
      if (!deleted) {
        throw new AppError('No se pudo eliminar el usuario', 500);
      }
      
      res.status(200).json({
        success: true,
        message: 'Usuario eliminado correctamente'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();