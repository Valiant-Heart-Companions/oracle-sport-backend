import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Competition {
  id?: number;
  sport_id: number;
  name: string;
  country: string;
  active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CompetitionWithSport extends Competition {
  sport_name?: string;
  sport_api_key?: string;
  sport_group?: string;
  events_count?: number;
}

export class CompetitionModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(competition: Competition): Promise<Competition> {
    const query = `
      INSERT INTO competitions 
        (sport_id, name, country, active)
      VALUES 
        ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      competition.sport_id,
      competition.name,
      competition.country,
      competition.active !== undefined ? competition.active : true
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<Competition | null> {
    const query = 'SELECT * FROM competitions WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByIdWithSport(id: number): Promise<CompetitionWithSport | null> {
    const query = `
      SELECT c.*, s.name as sport_name, s.api_sport_key, s.group_name as sport_group,
             COUNT(e.id) as events_count
      FROM competitions c
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN events e ON c.id = e.competition_id
      WHERE c.id = $1
      GROUP BY c.id, s.name, s.api_sport_key, s.group_name
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async findBySportId(sportId: number): Promise<Competition[]> {
    const query = 'SELECT * FROM competitions WHERE sport_id = $1 AND active = true ORDER BY name';
    const result: QueryResult = await this.db.query(query, [sportId]);
    
    return result.rows;
  }

  async findByName(name: string, sportId?: number): Promise<Competition | null> {
    let query = 'SELECT * FROM competitions WHERE name = $1';
    const queryParams: any[] = [name];
    
    if (sportId) {
      query += ' AND sport_id = $2';
      queryParams.push(sportId);
    }
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows.length ? result.rows[0] : null;
  }

  async getAll(
    page: number = 1, 
    limit: number = 50,
    filters?: {
      sportId?: number;
      active?: boolean;
      country?: string;
      search?: string;
    }
  ): Promise<{ competitions: CompetitionWithSport[], total: number }> {
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    if (filters?.sportId) {
      whereClause += ` AND c.sport_id = $${paramCounter++}`;
      queryParams.push(filters.sportId);
    }
    
    if (filters?.active !== undefined) {
      whereClause += ` AND c.active = $${paramCounter++}`;
      queryParams.push(filters.active);
    }
    
    if (filters?.country) {
      whereClause += ` AND c.country ILIKE $${paramCounter++}`;
      queryParams.push(`%${filters.country}%`);
    }
    
    if (filters?.search) {
      whereClause += ` AND c.name ILIKE $${paramCounter++}`;
      queryParams.push(`%${filters.search}%`);
    }
    
    // Obtener total de registros
    const countQuery = `
      SELECT COUNT(*) 
      FROM competitions c 
      JOIN sports s ON c.sport_id = s.id 
      ${whereClause}
    `;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Obtener competiciones con información del deporte
    const query = `
      SELECT c.*, s.name as sport_name, s.api_sport_key, s.group_name as sport_group,
             COUNT(e.id) as events_count
      FROM competitions c
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN events e ON c.id = e.competition_id
      ${whereClause}
      GROUP BY c.id, s.name, s.api_sport_key, s.group_name
      ORDER BY s.group_name, c.name
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;
    
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      competitions: result.rows,
      total
    };
  }

  async update(id: number, competitionData: Partial<Competition>): Promise<Competition | null> {
    const { sport_id, name, country, active } = competitionData;
    
    const queryParts = [];
    const values = [];
    let paramCounter = 1;
    
    if (sport_id !== undefined) {
      queryParts.push(`sport_id = $${paramCounter++}`);
      values.push(sport_id);
    }
    
    if (name) {
      queryParts.push(`name = $${paramCounter++}`);
      values.push(name);
    }
    
    if (country) {
      queryParts.push(`country = $${paramCounter++}`);
      values.push(country);
    }
    
    if (active !== undefined) {
      queryParts.push(`active = $${paramCounter++}`);
      values.push(active);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE competitions 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    // Verificar si hay eventos asociados
    const eventsQuery = 'SELECT COUNT(*) FROM events WHERE competition_id = $1';
    const eventsResult = await this.db.query(eventsQuery, [id]);
    const eventsCount = parseInt(eventsResult.rows[0].count, 10);
    
    if (eventsCount > 0) {
      throw new Error('No se puede eliminar la competición porque tiene eventos asociados');
    }
    
    const query = 'DELETE FROM competitions WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async toggleActive(id: number): Promise<Competition | null> {
    const query = `
      UPDATE competitions 
      SET active = NOT active, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async getCompetitionsWithStats(): Promise<CompetitionWithSport[]> {
    const query = `
      SELECT c.*, s.name as sport_name, s.api_sport_key, s.group_name as sport_group,
             COUNT(DISTINCT e.id) as events_count,
             COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'upcoming' AND e.commence_time > NOW()) as upcoming_events_count,
             COUNT(DISTINCT ti.id) as total_selections
      FROM competitions c
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN events e ON c.id = e.competition_id
      LEFT JOIN ticket_items ti ON e.id = ti.event_id
      WHERE c.active = true
      GROUP BY c.id, s.name, s.api_sport_key, s.group_name
      ORDER BY s.group_name, c.name
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows;
  }

  async upsert(competition: Competition): Promise<Competition> {
    const query = `
      INSERT INTO competitions (sport_id, name, country, active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sport_id, name) 
      DO UPDATE SET
        country = EXCLUDED.country,
        active = EXCLUDED.active,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      competition.sport_id,
      competition.name,
      competition.country,
      competition.active !== undefined ? competition.active : true
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }
}

export default new CompetitionModel();