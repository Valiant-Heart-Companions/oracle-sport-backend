import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Sport {
  id?: number;
  api_sport_key: string;
  name: string;
  group_name: string;
  description?: string;
  active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class SportModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(sport: Sport): Promise<Sport> {
    const query = `
      INSERT INTO sports 
        (api_sport_key, name, group_name, description, active)
      VALUES 
        ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      sport.api_sport_key,
      sport.name,
      sport.group_name,
      sport.description || '',
      sport.active !== undefined ? sport.active : true
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<Sport | null> {
    const query = 'SELECT * FROM sports WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByApiKey(apiKey: string): Promise<Sport | null> {
    const query = 'SELECT * FROM sports WHERE api_sport_key = $1';
    const result: QueryResult = await this.db.query(query, [apiKey]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async getAll(filters?: {
    active?: boolean;
    group?: string;
    page?: number;
    limit?: number;
  }): Promise<{ sports: Sport[], total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM sports WHERE 1=1';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    // Filtros opcionales
    if (filters?.active !== undefined) {
      query += ` AND active = $${paramCounter++}`;
      queryParams.push(filters.active);
    }
    
    if (filters?.group) {
      query += ` AND group_name = $${paramCounter++}`;
      queryParams.push(filters.group);
    }
    
    // Obtener total de registros
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Añadir ordenamiento y paginación
    query += ` ORDER BY group_name, name LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      sports: result.rows,
      total
    };
  }

  async getActiveByGroups(groups: string[]): Promise<Sport[]> {
    const query = `
      SELECT * FROM sports 
      WHERE active = true AND group_name = ANY($1)
      ORDER BY group_name, name
    `;
    
    const result: QueryResult = await this.db.query(query, [groups]);
    return result.rows;
  }

  async update(id: number, sportData: Partial<Sport>): Promise<Sport | null> {
    const { api_sport_key, name, group_name, description, active } = sportData;
    
    const queryParts = [];
    const values = [];
    let paramCounter = 1;
    
    if (api_sport_key) {
      queryParts.push(`api_sport_key = $${paramCounter++}`);
      values.push(api_sport_key);
    }
    
    if (name) {
      queryParts.push(`name = $${paramCounter++}`);
      values.push(name);
    }
    
    if (group_name) {
      queryParts.push(`group_name = $${paramCounter++}`);
      values.push(group_name);
    }
    
    if (description !== undefined) {
      queryParts.push(`description = $${paramCounter++}`);
      values.push(description);
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
      UPDATE sports 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    // Verificar si hay competiciones asociadas
    const competitionsQuery = 'SELECT COUNT(*) FROM competitions WHERE sport_id = $1';
    const competitionsResult = await this.db.query(competitionsQuery, [id]);
    const competitionsCount = parseInt(competitionsResult.rows[0].count, 10);
    
    if (competitionsCount > 0) {
      throw new Error('No se puede eliminar el deporte porque tiene competiciones asociadas');
    }
    
    const query = 'DELETE FROM sports WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async upsert(sport: Sport): Promise<Sport> {
    const query = `
      INSERT INTO sports (api_sport_key, name, group_name, description, active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (api_sport_key) 
      DO UPDATE SET
        name = EXCLUDED.name,
        group_name = EXCLUDED.group_name,
        description = EXCLUDED.description,
        active = EXCLUDED.active,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      sport.api_sport_key,
      sport.name,
      sport.group_name,
      sport.description || '',
      sport.active !== undefined ? sport.active : true
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async getSportsWithStats(): Promise<any[]> {
    const query = `
      SELECT s.*,
             COUNT(DISTINCT c.id) as competitions_count,
             COUNT(DISTINCT e.id) as events_count,
             COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'upcoming' AND e.commence_time > NOW()) as upcoming_events_count
      FROM sports s
      LEFT JOIN competitions c ON s.id = c.sport_id
      LEFT JOIN events e ON c.id = e.competition_id
      WHERE s.active = true
      GROUP BY s.id
      ORDER BY s.group_name, s.name
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows;
  }

  async toggleActive(id: number): Promise<Sport | null> {
    const query = `
      UPDATE sports 
      SET active = NOT active, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }
}

export default new SportModel();