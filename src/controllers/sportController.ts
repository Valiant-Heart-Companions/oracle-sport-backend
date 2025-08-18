import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { SportModel } from '../models/sport';
import { AppError } from '../middlewares/errorHandler';
import oddsApiService from '../services/oddsApiService';

const sportModel = new SportModel();

class SportController {
  // Obtener todos los deportes (público)
  async getSports(req: Request, res: Response, next: NextFunction) {
    try {
      const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
      const group = req.query.group as string;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '50');
      
      const { sports, total } = await sportModel.getAll({
        active,
        group,
        page,
        limit
      });
      
      res.status(200).json({
        success: true,
        data: {
          sports,
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
  
  // Obtener deportes principales activos (público)
  async getMainSports(req: Request, res: Response, next: NextFunction) {
    try {
      const mainGroups = ['Baseball', 'Soccer', 'Basketball', 'Ice Hockey'];
      const sports = await sportModel.getActiveByGroups(mainGroups);
      
      res.status(200).json({
        success: true,
        data: sports
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener deportes con estadísticas (público)
  async getSportsWithStats(req: Request, res: Response, next: NextFunction) {
    try {
      const sports = await sportModel.getSportsWithStats();
      
      res.status(200).json({
        success: true,
        data: sports
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener un deporte por ID (público)
  async getSportById(req: Request, res: Response, next: NextFunction) {
    try {
      const sportId = parseInt(req.params.id);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      const sport = await sportModel.findById(sportId);
      
      if (!sport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        data: sport
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener un deporte por API key (público)
  async getSportByApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const apiKey = req.params.apiKey;
      
      const sport = await sportModel.findByApiKey(apiKey);
      
      if (!sport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        data: sport
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Crear un nuevo deporte (solo admin)
  async createSport(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de deporte inválidos', 400);
      }
      
      const { api_sport_key, name, group_name, description, active } = req.body;
      
      // Verificar que no existe un deporte con la misma API key
      const existingSport = await sportModel.findByApiKey(api_sport_key);
      if (existingSport) {
        throw new AppError('Ya existe un deporte con esta API key', 400);
      }
      
      const newSport = await sportModel.create({
        api_sport_key,
        name,
        group_name,
        description,
        active
      });
      
      res.status(201).json({
        success: true,
        message: 'Deporte creado exitosamente',
        data: newSport
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar un deporte (solo admin)
  async updateSport(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de deporte inválidos', 400);
      }
      
      const sportId = parseInt(req.params.id);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      const { api_sport_key, name, group_name, description, active } = req.body;
      
      // Verificar que el deporte existe
      const existingSport = await sportModel.findById(sportId);
      if (!existingSport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      // Si se está cambiando la API key, verificar que no exista otra con la misma
      if (api_sport_key && api_sport_key !== existingSport.api_sport_key) {
        const duplicateSport = await sportModel.findByApiKey(api_sport_key);
        if (duplicateSport) {
          throw new AppError('Ya existe otro deporte con esta API key', 400);
        }
      }
      
      const updatedSport = await sportModel.update(sportId, {
        api_sport_key,
        name,
        group_name,
        description,
        active
      });
      
      res.status(200).json({
        success: true,
        message: 'Deporte actualizado exitosamente',
        data: updatedSport
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Alternar estado activo/inactivo de un deporte (solo admin)
  async toggleSportStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const sportId = parseInt(req.params.id);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      const sport = await sportModel.toggleActive(sportId);
      
      if (!sport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        message: `Deporte ${sport.active ? 'activado' : 'desactivado'} exitosamente`,
        data: sport
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar un deporte (solo admin)
  async deleteSport(req: Request, res: Response, next: NextFunction) {
    try {
      const sportId = parseInt(req.params.id);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      const deleted = await sportModel.delete(sportId);
      
      if (!deleted) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      res.status(200).json({
        success: true,
        message: 'Deporte eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Sincronizar deportes desde la API externa (solo admin)
  async syncSports(req: Request, res: Response, next: NextFunction) {
    try {
      await oddsApiService.syncSports();
      
      res.status(200).json({
        success: true,
        message: 'Deportes sincronizados exitosamente desde la API externa'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar eventos y cuotas para un deporte específico (solo admin)
  async syncSportEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const sportApiKey = process.env.ODDS_API_KEY;
      
      if (!sportApiKey) {
        throw new AppError('API key de deporte requerida', 400);
      }
      
      // Verificar que el deporte existe en nuestra base de datos
      const sport = await sportModel.findByApiKey(sportApiKey);
      if (!sport) {
        throw new AppError('Deporte no encontrado en la base de datos', 404);
      }
      
      if (!sport.active) {
        throw new AppError('No se pueden sincronizar eventos de un deporte inactivo', 400);
      }
      
      await oddsApiService.syncEventsBySport(sportApiKey);
      
      res.status(200).json({
        success: true,
        message: `Eventos y cuotas sincronizados exitosamente para ${sport.name}`
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener estadísticas de un deporte específico (solo admin)
  async getSportStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const sportId = parseInt(req.params.id);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      // Verificar que el deporte existe
      const sport = await sportModel.findById(sportId);
      if (!sport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      // Obtener estadísticas detalladas
      const statsQuery = `
        SELECT 
          s.name as sport_name,
          COUNT(DISTINCT c.id) as total_competitions,
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'upcoming' AND e.commence_time > NOW()) as upcoming_events,
          COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'completed') as completed_events,
          COUNT(DISTINCT t.id) as total_bets,
          COALESCE(SUM(t.stake_amount), 0) as total_stakes,
          COALESCE(SUM(t.potential_payout) FILTER (WHERE t.status = 'won'), 0) as total_payouts
        FROM sports s
        LEFT JOIN competitions c ON s.id = c.sport_id
        LEFT JOIN events e ON c.id = e.competition_id
        LEFT JOIN ticket_items ti ON e.id = ti.event_id
        LEFT JOIN tickets t ON ti.ticket_id = t.id
        WHERE s.id = $1
        GROUP BY s.id, s.name
      `;
      
      const pool = require('../config/database').default;
      const result = await pool.query(statsQuery, [sportId]);
      const stats = result.rows[0];
      
      res.status(200).json({
        success: true,
        data: {
          sport,
          statistics: stats
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new SportController();