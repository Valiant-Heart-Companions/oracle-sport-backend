import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { AppError } from '../middlewares/errorHandler';
import oddsApiService from '../services/oddsApiService';

export class EventController {
  async getEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const sportKey = req.query.sport_key as string;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '10');
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT e.id, e.api_event_id, e.home_team, e.away_team, e.commence_time, e.status,
               s.name as sport, c.name as competition
        FROM events e
        JOIN competitions c ON e.competition_id = c.id
        JOIN sports s ON c.sport_id = s.id
        WHERE e.status = 'upcoming' AND e.commence_time > NOW()
      `;
      
      const params: any[] = [];
      let paramCounter = 1;
      
      if (sportKey) {
        query += ` AND s.api_sport_key = $${paramCounter++}`;
        params.push(sportKey);
      }
      
      const countQuery = `
        SELECT COUNT(*) FROM (${query}) as count_query
      `;
      
      query += ` ORDER BY e.commence_time ASC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
      params.push(limit, offset);
      
      const eventsResult = await pool.query(query, params);
      const countResult = await pool.query(countQuery, params.slice(0, -2));
      
      const events = eventsResult.rows;
      const total = parseInt(countResult.rows[0].count);
      
      // Para cada evento, obtener sus cuotas
      for (const event of events) {
        const oddsQuery = `
          SELECT id, market_type, outcome_name, price, handicap, total, last_update
          FROM odds
          WHERE event_id = $1
          ORDER BY market_type, outcome_name
        `;
        
        const oddsResult = await pool.query(oddsQuery, [event.id]);
        event.odds = oddsResult.rows;
      }
      
      res.status(200).json({
        success: true,
        data: {
          events,
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

  async getEventById(req: Request, res: Response, next: NextFunction) {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        throw new AppError('ID de evento inválido', 400);
      }
      
      const query = `
        SELECT e.id, e.api_event_id, e.home_team, e.away_team, e.commence_time, e.status,
               s.name as sport, c.name as competition
        FROM events e
        JOIN competitions c ON e.competition_id = c.id
        JOIN sports s ON c.sport_id = s.id
        WHERE e.id = $1
      `;
      
      const result = await pool.query(query, [eventId]);
      
      if (result.rows.length === 0) {
        throw new AppError('Evento no encontrado', 404);
      }
      
      const event = result.rows[0];
      
      // Obtener las cuotas del evento
      const oddsQuery = `
        SELECT id, market_type, outcome_name, price, handicap, total, last_update
        FROM odds
        WHERE event_id = $1
        ORDER BY market_type, outcome_name
      `;
      
      const oddsResult = await pool.query(oddsQuery, [eventId]);
      event.odds = oddsResult.rows;
      
      res.status(200).json({
        success: true,
        data: event
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshEvents(req: Request, res: Response, next: NextFunction) {
    try {
      // Verificar que el usuario es administrador
      if (req.user?.role !== 'admin') {
        throw new AppError('No autorizado', 403);
      }
      
      const sportKey = req.query.sport_key as string;
      
      if (!sportKey) {
        throw new AppError('Se requiere el parámetro sport_key', 400);
      }
      
      // Sincronizar eventos desde la API
      await oddsApiService.syncEventsBySport(sportKey);
      
      res.status(200).json({
        success: true,
        message: `Eventos para ${sportKey} actualizados correctamente`
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new EventController();