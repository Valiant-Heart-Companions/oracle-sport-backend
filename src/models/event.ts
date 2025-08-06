import pool from '../config/database';
import { AppError } from '../middlewares/errorHandler';

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export interface Market {
  key: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Event {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export async function findByApiId(id: string): Promise<any> {
    try {
      const eventId = parseInt(id);
      if (isNaN(eventId)) {
        throw new AppError('ID de evento inválido', 400);
      }
      
      const query = `
        SELECT e.*
        FROM events e        
        WHERE e.id = $1
      `;
      
      const result = await pool.query(query, [eventId]);
      
      if (result.rows.length === 0) {
            return {
            success: false,
            data: []
        };
      }
      
      const event = result.rows[0];     
      
      
      return {
        success: true,
        data: event
      };
    } catch (error) {
      throw error;
    }
}