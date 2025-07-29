import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import pool from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { UserModel } from '../models/user';
import { BankDetailModel } from '../models/bankDetail';
import { CryptoDetailModel } from '../models/cryptoDetail';

const userModel = new UserModel();
const bankDetailModel = new BankDetailModel();
const cryptoDetailModel = new CryptoDetailModel();

class WithdrawalController {
  // Crear una nueva solicitud de retiro
  async createWithdrawal(req: Request, res: Response, next: NextFunction) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de retiro inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { amount, method, bank_detail_id, crypto_detail_id } = req.body;
      
      // Verificar que el usuario tenga saldo suficiente
      const user = await userModel.findById(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      if (user.balance !== undefined && user.balance < amount) {
        throw new AppError('Saldo insuficiente para realizar el retiro', 400);
      }
      
      // Validar método de retiro y detalles correspondientes
      if (method === 'mobile_payment') {
        if (!bank_detail_id) {
          throw new AppError('Se requiere seleccionar cuenta bancaria para pago móvil', 400);
        }
        
        // Verificar que el detalle bancario pertenece al usuario
        const bankDetail = await bankDetailModel.findById(bank_detail_id);
        if (!bankDetail || bankDetail.user_id !== userId) {
          throw new AppError('Detalle bancario no encontrado o no pertenece al usuario', 404);
        }
      } else if (method === 'binance') {
        if (!crypto_detail_id) {
          throw new AppError('Se requiere seleccionar dirección de wallet para Binance', 400);
        }
        
        // Verificar que el detalle de criptomoneda pertenece al usuario
        const cryptoDetail = await cryptoDetailModel.findById(crypto_detail_id);
        if (!cryptoDetail || cryptoDetail.user_id !== userId) {
          throw new AppError('Detalle de criptomoneda no encontrado o no pertenece al usuario', 404);
        }
      } else {
        throw new AppError('Método de retiro inválido', 400);
      }
      
      // Crear el retiro en estado pendiente
      const query = `
        INSERT INTO withdrawals (
          user_id, amount, method, bank_detail_id, crypto_detail_id, status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *
      `;
      
      const values = [userId, amount, method, bank_detail_id || null, crypto_detail_id || null];
      const result = await client.query(query, values);
      const withdrawal = result.rows[0];
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Solicitud de retiro creada exitosamente',
        data: withdrawal
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  // Obtener los retiros del usuario autenticado
  async getUserWithdrawals(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const offset = (page - 1) * limit;
      
      // Obtener total de retiros del usuario
      const countQuery = 'SELECT COUNT(*) FROM withdrawals WHERE user_id = $1';
      const countResult = await pool.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].count, 10);
      
      // Obtener retiros del usuario con paginación
      const query = `
        SELECT w.*, 
               bd.bank_name, bd.account_number, 
               cd.wallet_address, cd.network
        FROM withdrawals w
        LEFT JOIN bank_details bd ON w.bank_detail_id = bd.id
        LEFT JOIN crypto_details cd ON w.crypto_detail_id = cd.id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await pool.query(query, [userId, limit, offset]);
      
      res.status(200).json({
        success: true,
        data: {
          withdrawals: result.rows,
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
  
  // Obtener todos los retiros (solo para administradores)
  async getAllWithdrawals(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const offset = (page - 1) * limit;
      const status = req.query.status as string;
      
      let query = `
        SELECT w.*, 
               u.username, u.email,
               bd.bank_name, bd.account_number, bd.registered_phone,
               cd.wallet_address, cd.network
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        LEFT JOIN bank_details bd ON w.bank_detail_id = bd.id
        LEFT JOIN crypto_details cd ON w.crypto_detail_id = cd.id
        WHERE 1=1
      `;
      
      const queryParams: any[] = [];
      let paramCounter = 1;
      
      // Filtrar por estado si se proporciona
      if (status) {
        query += ` AND w.status = $${paramCounter++}`;
        queryParams.push(status);
      }
      
      // Obtener total de retiros
      const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count, 10);
      
      // Añadir ordenamiento y paginación
      query += ` ORDER BY w.created_at DESC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.status(200).json({
        success: true,
        data: {
          withdrawals: result.rows,
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
  
  // Actualizar el estado de un retiro (solo para administradores)
  async updateWithdrawalStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos inválidos', 400);
      }
      
      const withdrawalId = parseInt(req.params.id);
      const { status } = req.body;
      
      // Verificar que el retiro existe
      const getWithdrawalQuery = 'SELECT * FROM withdrawals WHERE id = $1';
      const withdrawalResult = await client.query(getWithdrawalQuery, [withdrawalId]);
      
      if (withdrawalResult.rows.length === 0) {
        throw new AppError('Retiro no encontrado', 404);
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      // Si el retiro ya está en el estado solicitado, no hacer nada
      if (withdrawal.status === status) {
        await client.query('ROLLBACK');
        res.status(200).json({
          success: true,
          message: `El retiro ya está en estado ${status}`,
          data: withdrawal
        });
        return; // Terminar la ejecución aquí
      }
      
      // Solo se pueden modificar retiros pendientes
      if (withdrawal.status !== 'pending') {
        throw new AppError(`No se puede modificar un retiro que ya está ${withdrawal.status}`, 400);
      }
      
      // Actualizar el estado del retiro
      const updateQuery = `
        UPDATE withdrawals 
        SET status = $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING *
      `;
      
      const updateResult = await client.query(updateQuery, [status, withdrawalId]);
      const updatedWithdrawal = updateResult.rows[0];
      
      // Si se rechaza, devolver el monto al usuario
      if (status === 'rejected') {
        const updateBalanceQuery = `
          UPDATE users 
          SET balance = balance + $1 
          WHERE id = $2
        `;
        
        await client.query(updateBalanceQuery, [withdrawal.amount, withdrawal.user_id]);
      }
      
      // Si se aprueba, verificar que el usuario no haya intentado extraer más del balance actual
      if (status === 'completed') {
        const userQuery = 'SELECT balance FROM users WHERE id = $1';
        const userResult = await client.query(userQuery, [withdrawal.user_id]);
        
        if (userResult.rows.length === 0) {
          throw new AppError('Usuario no encontrado', 404);
        }
        
        const user = userResult.rows[0];
        
        // Este control es redundante ya que el saldo se verifica al crear el retiro,
        // pero es una precaución adicional para casos donde el saldo cambia después
        if (user.balance < 0) {
          throw new AppError('El usuario tiene saldo negativo, no se puede completar el retiro', 400);
        }
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: `Estado del retiro actualizado a ${status}`,
        data: updatedWithdrawal
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
}

export default new WithdrawalController();