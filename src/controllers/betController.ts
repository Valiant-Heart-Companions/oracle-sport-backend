import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { AppError } from '../middlewares/errorHandler';

export class BetController {
  async placeBet(req: Request, res: Response, next: NextFunction) {
    // Iniciar transacción
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const userId = req.user!.id;
      const { stakeAmount, selections } = req.body;
      
      if (!Array.isArray(selections) || selections.length === 0) {
        throw new AppError('Se requiere al menos una selección para la apuesta', 400);
      }
      
      // Verificar saldo del usuario
      const userResult = await client.query(
        'SELECT balance FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new AppError('Usuario no encontrado', 404);
      }
      
      const userBalance = parseFloat(userResult.rows[0].balance);
      
      if (userBalance < stakeAmount) {
        throw new AppError('Saldo insuficiente', 400);
      }
      
      // Calcular cuota total
      let totalOdds = 1;
      const selectionDetails = [];
      
      for (const selection of selections) {
        const { oddsId } = selection;
        
        // Obtener detalles de la cuota
        const oddsResult = await client.query(
          `SELECT o.*, e.home_team, e.away_team, e.commence_time 
           FROM odds o
           JOIN events e ON o.event_id = e.id
           WHERE o.id = $1`,
          [oddsId]
        );
        
        if (oddsResult.rows.length === 0) {
          throw new AppError(`Cuota con id ${oddsId} no encontrada`, 404);
        }
        
        const odds = oddsResult.rows[0];
        
        // Verificar que el evento no ha comenzado
        const eventTime = new Date(odds.commence_time);
        const now = new Date();
        
        if (eventTime <= now) {
          throw new AppError(`El evento para la selección ${oddsId} ya ha comenzado`, 400);
        }
        
        // Convertir cuota americana a decimal
        const price = parseFloat(odds.price);
        let decimalOdds;
        
        if (price > 0) {
          decimalOdds = 1 + (price / 100);
        } else {
          decimalOdds = 1 + (100 / Math.abs(price));
        }
        
        totalOdds *= decimalOdds;
        
        selectionDetails.push({
          ...odds,
          decimalOdds
        });
      }
      
      // Calcular potencial pago
      const potentialPayout = stakeAmount * totalOdds;
      
      // Crear ticket
      const ticketResult = await client.query(
        `INSERT INTO tickets (user_id, total_odds, stake_amount, potential_payout, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [userId, totalOdds, stakeAmount, potentialPayout]
      );
      
      const ticketId = ticketResult.rows[0].id;
      
      // Registrar items del ticket
      for (const selection of selectionDetails) {
        await client.query(
          `INSERT INTO ticket_items (
             ticket_id, event_id, odds_id, odds_value, selection, handicap, total, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [
            ticketId,
            selection.event_id,
            selection.id,
            selection.price,
            //selection.market_type,
            selection.outcome_name,
            selection.handicap,
            selection.total,
          ]
        );
      }
      
      // Actualizar saldo del usuario
      await client.query(
        'UPDATE users SET balance = balance - $1 WHERE id = $2',
        [stakeAmount, userId]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Apuesta realizada exitosamente',
        data: {
          ticketId,
          stakeAmount,
          totalOdds,
          potentialPayout,
          selections: selectionDetails.map(s => ({
            eventId: s.event_id,
            homeTeam: s.home_team,
            awayTeam: s.away_team,
            betType: s.market_type,
            selection: s.outcome_name,
            odds: s.price,
            handicap: s.handicap,
            total: s.total
          }))
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  async getUserBets(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const offset = (page - 1) * limit;
      const status = req.query.status as string;
      
      let query = `
        SELECT t.id, t.stake_amount, t.total_odds, t.potential_payout, t.status, t.created_at
        FROM tickets t
        WHERE t.user_id = $1
      `;
      
      const params: any[] = [userId];
      let paramCounter = 2;
      
      if (status) {
        query += ` AND t.status = $${paramCounter++}`;
        params.push(status);
      }
      
      const countQuery = `
        SELECT COUNT(*) FROM (${query}) as count_query
      `;
      
      query += ` ORDER BY t.created_at DESC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
      params.push(limit, offset);
      
      const ticketsResult = await pool.query(query, params);
      const countResult = await pool.query(countQuery, params.slice(0, -2));
      
      const tickets = ticketsResult.rows;
      const total = parseInt(countResult.rows[0].count);
      
      // Para cada ticket, obtener sus selecciones
      for (const ticket of tickets) {
        const itemsQuery = `
          SELECT ti.id, ti.selection, ti.odds_value, ti.handicap, ti.total, ti.status,
                 e.home_team, e.away_team, e.commence_time, e.status as event_status
          FROM ticket_items ti
          JOIN events e ON ti.event_id = e.id
          WHERE ti.ticket_id = $1
          ORDER BY e.commence_time
        `;
        
        const itemsResult = await pool.query(itemsQuery, [ticket.id]);
        ticket.selections = itemsResult.rows;
      }
      
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
  
  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const ticketId = parseInt(req.params.id);
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      const query = `
        SELECT t.id, t.stake_amount, t.total_odds, t.potential_payout, t.status, t.created_at
        FROM tickets t
        WHERE t.id = $1 AND t.user_id = $2
      `;
      
      const result = await pool.query(query, [ticketId, userId]);
      
      if (result.rows.length === 0) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      const ticket = result.rows[0];
      
      // Obtener selecciones del ticket
      const itemsQuery = `
        SELECT ti.id, ti.bet_type, ti.selection, ti.odds_value, ti.handicap, ti.total, ti.status,
               e.home_team, e.away_team, e.commence_time, e.status as event_status
        FROM ticket_items ti
        JOIN events e ON ti.event_id = e.id
        WHERE ti.ticket_id = $1
        ORDER BY e.commence_time
      `;
      
      const itemsResult = await pool.query(itemsQuery, [ticketId]);
      ticket.selections = itemsResult.rows;
      
      res.status(200).json({
        success: true,
        data: ticket
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Solo para administradores
  async getAllBets(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const offset = (page - 1) * limit;
      const status = req.query.status as string;
      const username = req.query.username as string;
      
      let query = `
        SELECT t.id, t.stake_amount, t.total_odds, t.potential_payout, t.status, t.created_at,
               u.username, u.id as user_id
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramCounter = 1;
      
      if (status) {
        query += ` AND t.status = $${paramCounter++}`;
        params.push(status);
      }
      
      if (username) {
        query += ` AND u.username ILIKE $${paramCounter++}`;
        params.push(`%${username}%`);
      }
      
      const countQuery = `
        SELECT COUNT(*) FROM (${query}) as count_query
      `;
      
      query += ` ORDER BY t.created_at DESC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
      params.push(limit, offset);
      
      const ticketsResult = await pool.query(query, params);
      const countResult = await pool.query(countQuery, params.slice(0, -2));
      
      const tickets = ticketsResult.rows;
      const total = parseInt(countResult.rows[0].count);
      
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
  
  // Solo para administradores
  async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const ticketId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (isNaN(ticketId)) {
        throw new AppError('ID de ticket inválido', 400);
      }
      
      if (!['pending', 'won', 'lost', 'canceled'].includes(status)) {
        throw new AppError('Estado de ticket inválido', 400);
      }
      
      // Obtener ticket actual
      const ticketResult = await client.query(
        'SELECT * FROM tickets WHERE id = $1',
        [ticketId]
      );
      
      if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket no encontrado', 404);
      }
      
      const ticket = ticketResult.rows[0];
      
      // Si el ticket ya está en el estado solicitado, no hacer nada
      if (ticket.status === status) {
        return res.status(200).json({
          success: true,
          message: `El ticket ya está en estado ${status}`,
          data: ticket
        });
      }
      
      // Actualizar ticket
      await client.query(
        'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, ticketId]
      );
      
      // Actualizar selecciones del ticket
      await client.query(
        'UPDATE ticket_items SET status = $1, updated_at = NOW() WHERE ticket_id = $2',
        [status === 'canceled' ? 'canceled' : status, ticketId]
      );
      
      // Si el ticket se marca como ganado, actualizar el saldo del usuario
      if (status === 'won' && ticket.status === 'pending') {
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [ticket.potential_payout, ticket.user_id]
        );
      }
      
      // Si el ticket se cancela, devolver el importe apostado
      if (status === 'canceled' && ticket.status === 'pending') {
        await client.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [ticket.stake_amount, ticket.user_id]
        );
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: `Estado del ticket actualizado a ${status}`,
        data: {
          ...ticket,
          status
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
}

export default new BetController();