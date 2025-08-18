import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Odds {
  id?: number;
  event_id: number;
  market_type: string;
  outcome_name: string;
  price: number;
  handicap?: number;
  total?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface OddsWithEvent extends Odds {
  event?: {
    id: number;
    home_team: string;
    away_team: string;
    commence_time: Date;
    status: string;
  };
}

export class OddsModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(odds: Odds): Promise<Odds> {
    const query = `
      INSERT INTO odds 
        (event_id, market_type, outcome_name, price, handicap, total)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      odds.event_id,
      odds.market_type,
      odds.outcome_name,
      odds.price,
      odds.handicap,
      odds.total
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async createMany(oddsArray: Odds[]): Promise<Odds[]> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      
      for (const odds of oddsArray) {
        const query = `
          INSERT INTO odds 
            (event_id, market_type, outcome_name, price, handicap, total)
          VALUES 
            ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        
        const values = [
          odds.event_id,
          odds.market_type,
          odds.outcome_name,
          odds.price,
          odds.handicap,
          odds.total
        ];
        
        const result: QueryResult = await client.query(query, values);
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: number): Promise<Odds | null> {
    const query = 'SELECT * FROM odds WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByEventId(eventId: number): Promise<Odds[]> {
    const query = `
      SELECT * FROM odds 
      WHERE event_id = $1 
      ORDER BY market_type, outcome_name
    `;
    const result: QueryResult = await this.db.query(query, [eventId]);
    
    return result.rows;
  }

  async findByEventIdAndMarket(eventId: number, marketType: string): Promise<Odds[]> {
    const query = `
      SELECT * FROM odds 
      WHERE event_id = $1 AND market_type = $2 
      ORDER BY outcome_name
    `;
    const result: QueryResult = await this.db.query(query, [eventId, marketType]);
    
    return result.rows;
  }

  async findByMarketType(marketType: string, limit: number = 100): Promise<OddsWithEvent[]> {
    const query = `
      SELECT o.*, 
             json_build_object(
               'id', e.id,
               'home_team', e.home_team,
               'away_team', e.away_team,
               'commence_time', e.commence_time,
               'status', e.status
             ) as event
      FROM odds o
      JOIN events e ON o.event_id = e.id
      WHERE o.market_type = $1
      ORDER BY e.commence_time ASC
      LIMIT $2
    `;
    
    const result: QueryResult = await this.db.query(query, [marketType, limit]);
    return result.rows;
  }

  async update(id: number, oddsData: Partial<Odds>): Promise<Odds | null> {
    const { 
      event_id, 
      market_type, 
      outcome_name, 
      price, 
      handicap, 
      total 
    } = oddsData;
    
    const queryParts = [];
    const values = [];
    let paramCounter = 1;
    
    if (event_id !== undefined) {
      queryParts.push(`event_id = $${paramCounter++}`);
      values.push(event_id);
    }
    
    if (market_type) {
      queryParts.push(`market_type = $${paramCounter++}`);
      values.push(market_type);
    }
    
    if (outcome_name) {
      queryParts.push(`outcome_name = $${paramCounter++}`);
      values.push(outcome_name);
    }
    
    if (price !== undefined) {
      queryParts.push(`price = $${paramCounter++}`);
      values.push(price);
    }
    
    if (handicap !== undefined) {
      queryParts.push(`handicap = $${paramCounter++}`);
      values.push(handicap);
    }
    
    if (total !== undefined) {
      queryParts.push(`total = $${paramCounter++}`);
      values.push(total);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 1) { // Solo updated_at
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE odds 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM odds WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async deleteByEventId(eventId: number): Promise<boolean> {
    const query = 'DELETE FROM odds WHERE event_id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [eventId]);
    
    return result.rows.length > 0;
  }

  async deleteByMarketType(marketType: string): Promise<boolean> {
    const query = 'DELETE FROM odds WHERE market_type = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [marketType]);
    
    return result.rows.length > 0;
  }

  async getAll(
    page: number = 1, 
    limit: number = 50,
    filters?: {
      event_id?: number;
      market_type?: string;
      min_price?: number;
      max_price?: number;
    }
  ): Promise<{ odds: OddsWithEvent[], total: number }> {
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    if (filters?.event_id) {
      whereClause += ` AND o.event_id = $${paramCounter++}`;
      queryParams.push(filters.event_id);
    }
    
    if (filters?.market_type) {
      whereClause += ` AND o.market_type = $${paramCounter++}`;
      queryParams.push(filters.market_type);
    }
    
    if (filters?.min_price !== undefined) {
      whereClause += ` AND o.price >= $${paramCounter++}`;
      queryParams.push(filters.min_price);
    }
    
    if (filters?.max_price !== undefined) {
      whereClause += ` AND o.price <= $${paramCounter++}`;
      queryParams.push(filters.max_price);
    }
    
    // Obtener total de registros
    const countQuery = `
      SELECT COUNT(*) 
      FROM odds o
      JOIN events e ON o.event_id = e.id
      ${whereClause}
    `;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Obtener cuotas con información del evento
    const query = `
      SELECT o.*, 
             json_build_object(
               'id', e.id,
               'home_team', e.home_team,
               'away_team', e.away_team,
               'commence_time', e.commence_time,
               'status', e.status
             ) as event
      FROM odds o
      JOIN events e ON o.event_id = e.id
      ${whereClause}
      ORDER BY e.commence_time ASC, o.market_type, o.outcome_name
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;
    
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      odds: result.rows,
      total
    };
  }

  async getBestOddsByMarket(eventId: number, marketType: string): Promise<Odds[]> {
    const query = `
      SELECT DISTINCT ON (outcome_name) *
      FROM odds 
      WHERE event_id = $1 AND market_type = $2
      ORDER BY outcome_name, 
               CASE 
                 WHEN price >= 0 THEN price 
                 ELSE ABS(price) 
               END DESC
    `;
    
    const result: QueryResult = await this.db.query(query, [eventId, marketType]);
    return result.rows;
  }

  async getMarketTypes(): Promise<string[]> {
    const query = 'SELECT DISTINCT market_type FROM odds ORDER BY market_type';
    const result: QueryResult = await this.db.query(query);
    
    return result.rows.map(row => row.market_type);
  }

  async getStatistics(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_odds,
        COUNT(DISTINCT event_id) as total_events_with_odds,
        COUNT(DISTINCT market_type) as total_market_types,
        AVG(price) as average_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM odds
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows[0];
  }

  async getOddsByDateRange(startDate: Date, endDate: Date): Promise<OddsWithEvent[]> {
    const query = `
      SELECT o.*, 
             json_build_object(
               'id', e.id,
               'home_team', e.home_team,
               'away_team', e.away_team,
               'commence_time', e.commence_time,
               'status', e.status
             ) as event
      FROM odds o
      JOIN events e ON o.event_id = e.id
      WHERE e.commence_time >= $1 AND e.commence_time <= $2
      ORDER BY e.commence_time ASC, o.market_type
    `;
    
    const result: QueryResult = await this.db.query(query, [startDate, endDate]);
    return result.rows;
  }

  async updatePrices(eventId: number, marketType: string, newPrices: { outcome_name: string, price: number }[]): Promise<boolean> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const priceUpdate of newPrices) {
        const query = `
          UPDATE odds 
          SET price = $1, updated_at = NOW() 
          WHERE event_id = $2 AND market_type = $3 AND outcome_name = $4
        `;
        
        await client.query(query, [
          priceUpdate.price, 
          eventId, 
          marketType, 
          priceUpdate.outcome_name
        ]);
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Método para limpiar cuotas obsoletas
  async cleanupExpiredOdds(hours: number = 24): Promise<number> {
    const query = `
      DELETE FROM odds 
      WHERE event_id IN (
        SELECT id FROM events 
        WHERE commence_time < NOW() - INTERVAL '${hours} hours'
        AND status IN ('completed', 'canceled')
      )
      RETURNING id
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows.length;
  }

  // Upsert para sincronización con API externa
  async upsert(odds: Odds): Promise<Odds> {
    const query = `
      INSERT INTO odds (event_id, market_type, outcome_name, price, handicap, total)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (event_id, market_type, outcome_name, COALESCE(handicap, 0), COALESCE(total, 0)) 
      DO UPDATE SET
        price = EXCLUDED.price,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      odds.event_id,
      odds.market_type,
      odds.outcome_name,
      odds.price,
      odds.handicap,
      odds.total
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }
}

const oddsModel = new OddsModel();
export default oddsModel;