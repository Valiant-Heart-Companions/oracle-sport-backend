import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Event {
  id?: number;
  competition_id: number;
  api_event_id?: string;
  home_team: string;
  away_team: string;
  commence_time: Date;
  status?: 'upcoming' | 'live' | 'completed' | 'postponed' | 'canceled';
  created_at?: Date;
  updated_at?: Date;
}

export interface EventWithOdds extends Event {
  competition_name?: string;
  sport_name?: string;
  sport_api_key?: string;
  odds?: EventOdds[];
}

export interface EventOdds {
  id: number;
  market_type: string;
  outcome_name: string;
  price: number;
  handicap?: number;
  total?: number;
}

export interface EventWithDetails extends Event {
  competition?: {
    id: number;
    name: string;
    country: string;
    sport_id: number;
  };
  sport?: {
    id: number;
    name: string;
    api_sport_key: string;
    group_name: string;
  };
  odds?: EventOdds[];
  tickets_count?: number;
  total_stake?: number;
}

export class EventModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(event: Event): Promise<Event> {
    const query = `
      INSERT INTO events 
        (competition_id, api_event_id, home_team, away_team, commence_time, status)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      event.competition_id,
      event.api_event_id,
      event.home_team,
      event.away_team,
      event.commence_time,
      event.status || 'upcoming'
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<Event | null> {
    const query = 'SELECT * FROM events WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByIdWithDetails(id: number): Promise<EventWithDetails | null> {
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds,
             COUNT(DISTINCT ti.ticket_id) as tickets_count,
             COALESCE(SUM(DISTINCT t.stake_amount), 0) as total_stake
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      LEFT JOIN ticket_items ti ON e.id = ti.event_id
      LEFT JOIN tickets t ON ti.ticket_id = t.id
      WHERE e.id = $1
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async findByApiId(apiEventId: string): Promise<Event | null> {
    const query = 'SELECT * FROM events WHERE api_event_id = $1';
    const result: QueryResult = await this.db.query(query, [apiEventId]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByApiIdWithOdds(apiEventId: string): Promise<EventWithOdds | null> {
    const query = `
      SELECT e.*, c.name as competition_name, s.name as sport_name, s.api_sport_key,
             json_agg(
               json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      WHERE e.api_event_id = $1
      GROUP BY e.id, c.name, s.name, s.api_sport_key
    `;
    
    const result: QueryResult = await this.db.query(query, [apiEventId]);
    return result.rows.length ? result.rows[0] : null;
  }

  async findByCompetitionId(competitionId: number): Promise<Event[]> {
    const query = `
      SELECT * FROM events 
      WHERE competition_id = $1 
      ORDER BY commence_time ASC
    `;
    const result: QueryResult = await this.db.query(query, [competitionId]);
    
    return result.rows;
  }

  async getAll(
    page: number = 1, 
    limit: number = 20,
    filters?: {
      competition_id?: number;
      sport_id?: number;
      status?: string;
      date_from?: Date;
      date_to?: Date;
      search?: string;
    }
  ): Promise<{ events: EventWithDetails[], total: number }> {
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    if (filters?.competition_id) {
      whereClause += ` AND e.competition_id = $${paramCounter++}`;
      queryParams.push(filters.competition_id);
    }
    
    if (filters?.sport_id) {
      whereClause += ` AND s.id = $${paramCounter++}`;
      queryParams.push(filters.sport_id);
    }
    
    if (filters?.status) {
      whereClause += ` AND e.status = $${paramCounter++}`;
      queryParams.push(filters.status);
    }
    
    if (filters?.date_from) {
      whereClause += ` AND e.commence_time >= $${paramCounter++}`;
      queryParams.push(filters.date_from);
    }
    
    if (filters?.date_to) {
      whereClause += ` AND e.commence_time <= $${paramCounter++}`;
      queryParams.push(filters.date_to);
    }
    
    if (filters?.search) {
      whereClause += ` AND (e.home_team ILIKE $${paramCounter++} OR e.away_team ILIKE $${paramCounter++})`;
      queryParams.push(`%${filters.search}%`, `%${filters.search}%`);
      paramCounter++; // Incrementar una vez más porque usamos dos parámetros
    }
    
    // Obtener total de registros
    const countQuery = `
      SELECT COUNT(*) 
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      ${whereClause}
    `;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Obtener eventos con detalles
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds,
             COUNT(DISTINCT ti.ticket_id) as tickets_count,
             COALESCE(SUM(DISTINCT t.stake_amount), 0) as total_stake
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      LEFT JOIN ticket_items ti ON e.id = ti.event_id
      LEFT JOIN tickets t ON ti.ticket_id = t.id
      ${whereClause}
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY e.commence_time ASC
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;
    
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      events: result.rows,
      total
    };
  }

  async getUpcomingEvents(
    limit: number = 20,
    sportIds?: number[]
  ): Promise<EventWithDetails[]> {
    let whereClause = 'WHERE e.status = $1 AND e.commence_time > NOW()';
    const queryParams: any[] = ['upcoming'];
    let paramCounter = 2;
    
    if (sportIds && sportIds.length > 0) {
      whereClause += ` AND s.id = ANY($${paramCounter++})`;
      queryParams.push(sportIds);
    }
    
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      ${whereClause}
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY e.commence_time ASC
      LIMIT $${paramCounter}
    `;
    
    queryParams.push(limit);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows;
  }

  async getLiveEvents(): Promise<EventWithDetails[]> {
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      WHERE e.status = 'live'
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY e.commence_time DESC
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows;
  }

  async update(id: number, eventData: Partial<Event>): Promise<Event | null> {
    const { 
      competition_id, 
      api_event_id, 
      home_team, 
      away_team, 
      commence_time, 
      status 
    } = eventData;
    
    const queryParts = [];
    const values = [];
    let paramCounter = 1;
    
    if (competition_id !== undefined) {
      queryParts.push(`competition_id = $${paramCounter++}`);
      values.push(competition_id);
    }
    
    if (api_event_id !== undefined) {
      queryParts.push(`api_event_id = $${paramCounter++}`);
      values.push(api_event_id);
    }
    
    if (home_team) {
      queryParts.push(`home_team = $${paramCounter++}`);
      values.push(home_team);
    }
    
    if (away_team) {
      queryParts.push(`away_team = $${paramCounter++}`);
      values.push(away_team);
    }
    
    if (commence_time) {
      queryParts.push(`commence_time = $${paramCounter++}`);
      values.push(commence_time);
    }
    
    if (status) {
      queryParts.push(`status = $${paramCounter++}`);
      values.push(status);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 1) { // Solo updated_at
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE events 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async updateStatus(id: number, status: 'upcoming' | 'live' | 'completed' | 'postponed' | 'canceled'): Promise<Event | null> {
    const query = `
      UPDATE events 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    // Verificar si hay tickets asociados
    const ticketsQuery = 'SELECT COUNT(*) FROM ticket_items WHERE event_id = $1';
    const ticketsResult = await this.db.query(ticketsQuery, [id]);
    const ticketsCount = parseInt(ticketsResult.rows[0].count, 10);
    
    if (ticketsCount > 0) {
      throw new Error('No se puede eliminar el evento porque tiene apuestas asociadas');
    }
    
    const query = 'DELETE FROM events WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async getEventsByDateRange(
    startDate: Date, 
    endDate: Date,
    sportIds?: number[]
  ): Promise<EventWithDetails[]> {
    let whereClause = 'WHERE e.commence_time >= $1 AND e.commence_time <= $2';
    const queryParams: any[] = [startDate, endDate];
    let paramCounter = 3;
    
    if (sportIds && sportIds.length > 0) {
      whereClause += ` AND s.id = ANY($${paramCounter++})`;
      queryParams.push(sportIds);
    }
    
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      ${whereClause}
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY e.commence_time ASC
    `;
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows;
  }

  async getPopularEvents(limit: number = 10): Promise<EventWithDetails[]> {
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds,
             COUNT(DISTINCT ti.ticket_id) as tickets_count
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      LEFT JOIN ticket_items ti ON e.id = ti.event_id
      WHERE e.status = 'upcoming' AND e.commence_time > NOW()
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY tickets_count DESC, e.commence_time ASC
      LIMIT $1
    `;
    
    const result: QueryResult = await this.db.query(query, [limit]);
    return result.rows;
  }

  async getStatistics(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE status = 'upcoming') as upcoming_events,
        COUNT(*) FILTER (WHERE status = 'live') as live_events,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_events,
        COUNT(*) FILTER (WHERE commence_time > NOW()) as future_events,
        COUNT(DISTINCT competition_id) as total_competitions
      FROM events
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows[0];
  }

  // Método específico para búsqueda por términos
  async search(searchTerm: string, limit: number = 20): Promise<EventWithDetails[]> {
    const query = `
      SELECT e.*, 
             json_build_object(
               'id', c.id,
               'name', c.name,
               'country', c.country,
               'sport_id', c.sport_id
             ) as competition,
             json_build_object(
               'id', s.id,
               'name', s.name,
               'api_sport_key', s.api_sport_key,
               'group_name', s.group_name
             ) as sport,
             json_agg(
               DISTINCT json_build_object(
                 'id', o.id,
                 'market_type', o.market_type,
                 'outcome_name', o.outcome_name,
                 'price', o.price,
                 'handicap', o.handicap,
                 'total', o.total
               )
             ) FILTER (WHERE o.id IS NOT NULL) as odds
      FROM events e
      JOIN competitions c ON e.competition_id = c.id
      JOIN sports s ON c.sport_id = s.id
      LEFT JOIN odds o ON e.id = o.event_id
      WHERE (
        e.home_team ILIKE $1 OR 
        e.away_team ILIKE $1 OR 
        c.name ILIKE $1 OR 
        s.name ILIKE $1
      )
      GROUP BY e.id, c.id, c.name, c.country, c.sport_id, s.id, s.name, s.api_sport_key, s.group_name
      ORDER BY e.commence_time ASC
      LIMIT $2
    `;
    
    const result: QueryResult = await this.db.query(query, [`%${searchTerm}%`, limit]);
    return result.rows;
  }

  // Método para obtener eventos que expiran pronto (para limpiar cuotas obsoletas)
  async getExpiringEvents(hours: number = 2): Promise<Event[]> {
    const query = `
      SELECT * FROM events 
      WHERE status = 'upcoming' 
      AND commence_time <= NOW() + INTERVAL '${hours} hours'
      AND commence_time > NOW()
      ORDER BY commence_time ASC
    `;
    
    const result: QueryResult = await this.db.query(query);
    return result.rows;
  }

  // Upsert para sincronización con API externa
  async upsert(event: Event): Promise<Event> {
    const query = `
      INSERT INTO events (competition_id, api_event_id, home_team, away_team, commence_time, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (api_event_id) 
      DO UPDATE SET
        competition_id = EXCLUDED.competition_id,
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        commence_time = EXCLUDED.commence_time,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      event.competition_id,
      event.api_event_id,
      event.home_team,
      event.away_team,
      event.commence_time,
      event.status || 'upcoming'
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }
}

export default new EventModel();