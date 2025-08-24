import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import oddsApiService from '../services/oddsApiService';
import { AppError } from '../middlewares/errorHandler';

class OddsApiController {
  // Obtener deportes disponibles
  async getSports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sports = await oddsApiService.getSports();
      
      res.status(200).json({
        success: true,
        data: sports
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener eventos por deporte
  async getEventsBySport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sportKey } = req.params;
      const { regions, markets, oddsFormat } = req.query;

      if (!sportKey) {
        throw new AppError('Sport key es requerido', 400);
      }

      const events = await oddsApiService.fetchAndSyncEvents(sportKey);
      
      res.status(200).json({
        success: true,
        data: events,
        message: `${events.length} eventos obtenidos y sincronizados`
      });
    } catch (error) {
      next(error);
    }
  }

  // Sincronizar todos los deportes principales
  async syncAllMainSports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mainSports = [
        'soccer_epl',
        'basketball_nba',
        'baseball_mlb',
        'icehockey_nhl',
        'americanfootball_nfl'
      ];

      const results = [];

      for (const sportKey of mainSports) {
        try {
          console.log(`🔄 Sincronizando ${sportKey}...`);
          let events = await oddsApiService.fetchAndSyncEvents(sportKey);
          
          results.push({
            sport: sportKey,
            events_count: events.length,
            status: 'success'
          });
        } catch (error) {
          console.error(`❌ Error sincronizando ${sportKey}:`, error);
          results.push({
            sport: sportKey,
            events_count: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.status(200).json({
        success: true,
        data: results,
        message: 'Sincronización completada'
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener información de uso de la API
  async getApiUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const usage = await oddsApiService.getApiUsage();
      
      res.status(200).json({
        success: true,
        data: usage
      });
    } catch (error) {
      next(error);
    }
  }

  // Validar evento específico
  async validateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { apiEventId } = req.params;

      if (!apiEventId) {
        throw new AppError('API Event ID es requerido', 400);
      }

      const eventId = await oddsApiService.validateAndSyncEvent(apiEventId);
      
      if (!eventId) {
        throw new AppError('Evento no encontrado en la API', 404);
      }

      res.status(200).json({
        success: true,
        data: { eventId },
        message: 'Evento validado y sincronizado'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new OddsApiController();