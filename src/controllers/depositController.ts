import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { DepositModel } from '../models/deposit';
import { UserModel } from '../models/user';
import { AppError } from '../middlewares/errorHandler';
import pool from '../config/database';

const depositModel = new DepositModel();
const userModel = new UserModel();

class DepositController {
  // Crear un nuevo depósito
  async createDeposit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de depósito inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { amount, method, reference_number, transaction_hash, deposit_date } = req.body;
      
      // Validar método de depósito
      const validMethods = ['bank_transfer', 'mobile_payment', 'binance'];
      if (!validMethods.includes(method)) {
        throw new AppError('Método de depósito inválido', 400);
      }
      
      // Validar campos requeridos según el método
      if (method === 'binance' && !transaction_hash) {
        throw new AppError('Hash de transacción requerido para depósitos Binance', 400);
      }
      
      if ((method === 'bank_transfer' || method === 'mobile_payment') && !reference_number) {
        throw new AppError('Número de referencia requerido para este método de depósito', 400);
      }
      
      // Crear el depósito
      const newDeposit = await depositModel.create({
        user_id: userId,
        amount,
        method,
        reference_number,
        transaction_hash,
        status: 'pending',
        deposit_date: new Date(deposit_date)
      });
      
      res.status(201).json({
        success: true,
        message: 'Solicitud de depósito creada exitosamente. Será revisada en breve.',
        data: newDeposit
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener depósitos del usuario autenticado
  async getUserDeposits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const status = req.query.status as string;
      
      const { deposits, total } = await depositModel.findByUserId(userId, page, limit, status);
      
      res.status(200).json({
        success: true,
        data: {
          deposits,
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
  
  // Obtener un depósito específico del usuario
  async getUserDepositById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const depositId = parseInt(req.params.id);
      
      if (isNaN(depositId)) {
        throw new AppError('ID de depósito inválido', 400);
      }
      
      const deposit = await depositModel.findById(depositId);
      
      if (!deposit) {
        throw new AppError('Depósito no encontrado', 404);
      }
      
      // Verificar que el depósito pertenece al usuario
      if (deposit.user_id !== userId) {
        throw new AppError('No autorizado para ver este depósito', 403);
      }
      
      res.status(200).json({
        success: true,
        data: deposit
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener estadísticas de depósitos del usuario
  async getUserDepositStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const statistics = await depositModel.getDepositStatistics(userId);
      
      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  }
  
  // RUTAS ADMINISTRATIVAS
  
  // Obtener todos los depósitos (solo admin)
  async getAllDeposits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const status = req.query.status as string;
      const method = req.query.method as string;
      const username = req.query.username as string;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const { deposits, total } = await depositModel.getAll(page, limit, {
        status,
        method,
        username,
        dateFrom,
        dateTo
      });
      
      res.status(200).json({
        success: true,
        data: {
          deposits,
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
  
  // Obtener un depósito por ID (solo admin)
  async getDepositById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const depositId = parseInt(req.params.id);
      
      if (isNaN(depositId)) {
        throw new AppError('ID de depósito inválido', 400);
      }
      
      const deposit = await depositModel.findById(depositId);
      
      if (!deposit) {
        throw new AppError('Depósito no encontrado', 404);
      }
      
      // Obtener información del usuario
      const user = await userModel.findById(deposit.user_id);
      
      res.status(200).json({
        success: true,
        data: {
          ...deposit,
          user: user ? {
            id: user.id,
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar estado de depósito (solo admin)
  async updateDepositStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos inválidos', 400);
      }
      
      const depositId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (isNaN(depositId)) {
        throw new AppError('ID de depósito inválido', 400);
      }
      
      // Verificar que el depósito existe
      const deposit = await depositModel.findById(depositId);
      if (!deposit) {
        throw new AppError('Depósito no encontrado', 404);
      }
      
      // Si el depósito ya está en el estado solicitado, no hacer nada
      if (deposit.status === status) {
        await client.query('ROLLBACK');
        res.status(200).json({
          success: true,
          message: `El depósito ya está en estado ${status}`,
          data: deposit
        });
        return;
      }
      
      // Solo se pueden modificar depósitos pendientes
      if (deposit.status !== 'pending') {
        throw new AppError(`No se puede modificar un depósito que ya está ${deposit.status}`, 400);
      }
      
      // Actualizar el estado del depósito
      const updatedDeposit = await depositModel.updateStatus(depositId, status);
      
      // Si se aprueba el depósito, actualizar el saldo del usuario
      if (status === 'completed') {
        await userModel.updateBalance(deposit.user_id, deposit.amount);
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: `Estado del depósito actualizado a ${status}`,
        data: updatedDeposit
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  // Actualizar información de depósito (solo admin)
  async updateDeposit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de depósito inválidos', 400);
      }
      
      const depositId = parseInt(req.params.id);
      const { amount, method, reference_number, transaction_hash, deposit_date } = req.body;
      
      if (isNaN(depositId)) {
        throw new AppError('ID de depósito inválido', 400);
      }
      
      const updatedDeposit = await depositModel.update(depositId, {
        amount,
        method,
        reference_number,
        transaction_hash,
        deposit_date: deposit_date ? new Date(deposit_date) : undefined
      });
      
      if (!updatedDeposit) {
        throw new AppError('Depósito no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        message: 'Depósito actualizado exitosamente',
        data: updatedDeposit
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar depósito (solo admin)
  async deleteDeposit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const depositId = parseInt(req.params.id);
      
      if (isNaN(depositId)) {
        throw new AppError('ID de depósito inválido', 400);
      }
      
      // Verificar que el depósito existe y está pendiente
      const deposit = await depositModel.findById(depositId);
      if (!deposit) {
        throw new AppError('Depósito no encontrado', 404);
      }
      
      if (deposit.status !== 'pending') {
        throw new AppError('Solo se pueden eliminar depósitos pendientes', 400);
      }
      
      const deleted = await depositModel.delete(depositId);
      
      if (!deleted) {
        throw new AppError('No se pudo eliminar el depósito', 500);
      }
      
      res.status(200).json({
        success: true,
        message: 'Depósito eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener estadísticas generales de depósitos (solo admin)
  async getDepositStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const statistics = await depositModel.getDepositStatistics();
      
      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener depósitos recientes (solo admin)
  async getRecentDeposits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string || '10');
      const deposits = await depositModel.getRecentDeposits(limit);
      
      res.status(200).json({
        success: true,
        data: deposits
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new DepositController();