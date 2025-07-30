import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { CompetitionModel } from '../models/competition';
import { SportModel } from '../models/sport';
import { AppError } from '../middlewares/errorHandler';

const competitionModel = new CompetitionModel();
const sportModel = new SportModel();

class CompetitionController {
  // Obtener todas las competiciones (público)
  async getCompetitions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sportId = req.query.sportId ? parseInt(req.query.sportId as string) : undefined;
      const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
      const country = req.query.country as string;
      const search = req.query.search as string;
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '50');
      
      const { competitions, total } = await competitionModel.getAll(page, limit, {
        sportId,
        active,
        country,
        search
      });
      
      res.status(200).json({
        success: true,
        data: {
          competitions,
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
  
  // Obtener competiciones por deporte (público)
  async getCompetitionsBySport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sportId = parseInt(req.params.sportId);
      
      if (isNaN(sportId)) {
        throw new AppError('ID de deporte inválido', 400);
      }
      
      const competitions = await competitionModel.findBySportId(sportId);
      
      res.status(200).json({
        success: true,
        data: competitions
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener competiciones con estadísticas (público)
  async getCompetitionsWithStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitions = await competitionModel.getCompetitionsWithStats();
      
      res.status(200).json({
        success: true,
        data: competitions
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Obtener una competición por ID (público)
  async getCompetitionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitionId = parseInt(req.params.id);
      
      if (isNaN(competitionId)) {
        throw new AppError('ID de competición inválido', 400);
      }
      
      const competition = await competitionModel.findByIdWithSport(competitionId);
      
      if (!competition) {
        throw new AppError('Competición no encontrada', 404);
      }
      
      res.status(200).json({
        success: true,
        data: competition
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Crear una nueva competición (solo admin)
  async createCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de competición inválidos', 400);
      }
      
      const { sport_id, name, country, active } = req.body;
      
      // Verificar que el deporte existe
      const sport = await sportModel.findById(sport_id);
      if (!sport) {
        throw new AppError('Deporte no encontrado', 404);
      }
      
      // Verificar que no existe una competición con el mismo nombre para este deporte
      const existingCompetition = await competitionModel.findByName(name, sport_id);
      if (existingCompetition) {
        throw new AppError('Ya existe una competición con este nombre para este deporte', 400);
      }
      
      const newCompetition = await competitionModel.create({
        sport_id,
        name,
        country,
        active
      });
      
      res.status(201).json({
        success: true,
        message: 'Competición creada exitosamente',
        data: newCompetition
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Actualizar una competición (solo admin)
  async updateCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Datos de competición inválidos', 400);
      }
      
      const competitionId = parseInt(req.params.id);
      
      if (isNaN(competitionId)) {
        throw new AppError('ID de competición inválido', 400);
      }
      
      const { sport_id, name, country, active } = req.body;
      
      // Verificar que la competición existe
      const existingCompetition = await competitionModel.findById(competitionId);
      if (!existingCompetition) {
        throw new AppError('Competición no encontrada', 404);
      }
      
      // Si se está cambiando el deporte, verificar que existe
      if (sport_id && sport_id !== existingCompetition.sport_id) {
        const sport = await sportModel.findById(sport_id);
        if (!sport) {
          throw new AppError('Deporte no encontrado', 404);
        }
      }
      
      // Si se está cambiando el nombre, verificar que no exista otra con el mismo nombre
      if (name && name !== existingCompetition.name) {
        const duplicateCompetition = await competitionModel.findByName(name, sport_id || existingCompetition.sport_id);
        if (duplicateCompetition && duplicateCompetition.id !== competitionId) {
          throw new AppError('Ya existe otra competición con este nombre para este deporte', 400);
        }
      }
      
      const updatedCompetition = await competitionModel.update(competitionId, {
        sport_id,
        name,
        country,
        active
      });
      
      res.status(200).json({
        success: true,
        message: 'Competición actualizada exitosamente',
        data: updatedCompetition
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Alternar estado activo/inactivo de una competición (solo admin)
  async toggleCompetitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitionId = parseInt(req.params.id);
      
      if (isNaN(competitionId)) {
        throw new AppError('ID de competición inválido', 400);
      }
      
      const competition = await competitionModel.toggleActive(competitionId);
      
      if (!competition) {
        throw new AppError('Competición no encontrada', 404);
      }
      
      res.status(200).json({
        success: true,
        message: `Competición ${competition.active ? 'activada' : 'desactivada'} exitosamente`,
        data: competition
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Eliminar una competición (solo admin)
  async deleteCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitionId = parseInt(req.params.id);
      
      if (isNaN(competitionId)) {
        throw new AppError('ID de competición inválido', 400);
      }
      
      const deleted = await competitionModel.delete(competitionId);
      
      if (!deleted) {
        throw new AppError('Competición no encontrada', 404);
      }
      
      res.status(200).json({
        success: true,
        message: 'Competición eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CompetitionController();