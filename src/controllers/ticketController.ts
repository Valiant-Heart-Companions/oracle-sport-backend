import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import pool from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import { TicketModel } from '../models/ticket';
import { TicketItemModel } from '../models/ticketItem';
import { UserModel } from '../models/user';

const ticketModel = new TicketModel();
const ticketItemModel = new TicketItemModel();
const userModel = new UserModel();

class TicketController {
  // Crear un nuevo ticket de apuesta
  async createTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de apuesta inválidos', 400);
      }
      
      const userId = req.user!.id;
      const { stake_amount, selections } = req.body;
      
      // Validar que hay selecciones
      if (!selections || !Array.isArray(selections) || selections.length === 0) {
        throw new AppError('Debe incluir al menos una selección', 400);
      }
      
      // Verificar saldo del usuario
      const user = await userModel.findById(userId);
      if (!user) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      if (typeof user.balance !== 'number' || user.balance < stake_amount) {
        throw new AppError('Saldo insuficiente para realizar esta apuesta', 400);
      }
      
      // Calcular cuota total y ganancia potencial
      let totalOdds = 1;
      for (const selection of selections) {
        totalOdds *= parseFloat(selection.odds_value);
      }
      
      const potentialPayout = stake_amount * totalOdds;
      
      // Crear el ticket
      const newTicket = await ticketModel.create({
        user_id: userId,
        stake_amount,
        total_odds: totalOdds,
        potential_payout: potentialPayout,
        status: 'pending'
      });
      
      // Crear los items del ticket
      if (typeof newTicket.id !== 'number') {
        throw new AppError('ID de ticket inválido al crear items', 500);
      }
      const ticketItems = selections.map((selection: any) => ({
        ticket_id: newTicket.id as number,
        event_id: selection.event_id,
        odds_id: selection.odds_id,
        selection: selection.selection,
        odds_value: parseFloat(selection.odds_value),
        status: "pending" as "pending"
      }));
      
      await ticketItemModel.createMany(ticketItems);
      
      // Descontar el monto del saldo del usuario
      const updateBalanceQuery = `
        UPDATE users 
        SET balance = balance - $1 
        WHERE id = $2
      `;
      await client.query(updateBalanceQuery, [stake_amount, userId]);
      
      await client.query('COMMIT');
      
      // Obtener el ticket completo con detalles
      const ticketWithDetails = await ticketModel.findByIdWithDetails(newTicket.id!);
      
      res.status(201).json({
        success: true,
        message: 'Apuesta realizada exitosamente',
        data: ticketWithDetails
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  // Obtener tickets del usuario autenticado
  async getUserTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const status = req.query.status as string;
      
      const { tickets, total } = await ticketModel.findByUserId(userId, page, limit, status);
      
      res.status(200).json({
        success: true,
        data: {
          tickets,
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
  
  // Obtener un ticket específico del usuario
  async getUserTicketById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ticketId = parseInt(req.params.id);
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      const ticket = await ticketModel.findByIdWithDetails(ticketId);
      
      if (!ticket) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      // Verificar que el ticket pertenece al usuario
      if (ticket.user_id !== userId) {
        throw new AppError('No autorizado para ver este ticket', 403);
      }
      
      res.status(200).json({
        success: true,
        data: ticket
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener estadísticas de tickets del usuario
  async getUserTicketStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const statistics = await ticketModel.getStatistics(userId);
      
      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  }
  
  // RUTAS ADMINISTRATIVAS
  
  // Obtener todos los tickets (solo admin)
  async getAllTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const status = req.query.status as string;
      const username = req.query.username as string;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      const { tickets, total } = await ticketModel.getAll(page, limit, {
        status,
        username,
        dateFrom,
        dateTo
      });
      
      res.status(200).json({
        success: true,
        data: {
          tickets,
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
  
  // Obtener un ticket por ID (solo admin)
  async getTicketById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticketId = parseInt(req.params.id);
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      const ticket = await ticketModel.findByIdWithDetails(ticketId);
      
      if (!ticket) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        data: ticket
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar estado de ticket (solo admin)
  async updateTicketStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos inválidos', 400);
      }
      
      const ticketId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      // Verificar que el ticket existe
      const ticket = await ticketModel.findById(ticketId);
      if (!ticket) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      // Si el ticket ya está en el estado solicitado, no hacer nada
      if (ticket.status === status) {
        await client.query('ROLLBACK');
        res.status(200).json({
          success: true,
          message: `El ticket ya está en estado ${status}`,
          data: ticket
        });
        return;
      }
      
      // Solo se pueden modificar tickets pendientes
      if (ticket.status !== 'pending') {
        throw new AppError(`No se puede modificar un ticket que ya está ${ticket.status}`, 400);
      }
      
      // Actualizar el estado del ticket
      const updatedTicket = await ticketModel.updateStatus(ticketId, status);
      
      // Actualizar el estado de todos los items del ticket
      await ticketItemModel.updateStatusByTicketId(ticketId, status);
      
      // Si el ticket gana, agregar las ganancias al usuario
      if (status === 'won') {
        const updateBalanceQuery = `
          UPDATE users 
          SET balance = balance + $1 
          WHERE id = $2
        `;
        await client.query(updateBalanceQuery, [ticket.potential_payout, ticket.user_id]);
      }
      
      // Si el ticket se cancela, devolver el stake al usuario
      if (status === 'canceled') {
        const updateBalanceQuery = `
          UPDATE users 
          SET balance = balance + $1 
          WHERE id = $2
        `;
        await client.query(updateBalanceQuery, [ticket.stake_amount, ticket.user_id]);
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: `Estado del ticket actualizado a ${status}`,
        data: updatedTicket
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  // Eliminar ticket (solo admin)
  async deleteTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const ticketId = parseInt(req.params.id);
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      // Verificar que el ticket existe
      const ticket = await ticketModel.findById(ticketId);
      if (!ticket) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      // Solo se pueden eliminar tickets pendientes o cancelados
      if (!['pending', 'canceled'].includes(ticket.status!)) {
        throw new AppError('Solo se pueden eliminar tickets pendientes o cancelados', 400);
      }
      
      // Si el ticket está pendiente, devolver el stake al usuario
      if (ticket.status === 'pending') {
        const updateBalanceQuery = `
          UPDATE users 
          SET balance = balance + $1 
          WHERE id = $2
        `;
        await client.query(updateBalanceQuery, [ticket.stake_amount, ticket.user_id]);
      }
      
      // Eliminar items del ticket
      await ticketItemModel.deleteByTicketId(ticketId);
      
      // Eliminar el ticket
      const deleted = await ticketModel.delete(ticketId);
      
      if (!deleted) {
        throw new AppError('No se pudo eliminar el ticket', 500);
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: 'Ticket eliminado exitosamente'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  // Obtener estadísticas generales de tickets (solo admin)
  async getTicketStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const statistics = await ticketModel.getStatistics();
      
      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener tickets recientes (solo admin)
  async getRecentTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string || '10');
      const tickets = await ticketModel.getRecentTickets(limit);
      
      res.status(200).json({
        success: true,
        data: tickets
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TicketController();
