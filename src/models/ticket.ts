import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Ticket {
  id?: number;
  user_id: number;
  stake_amount: number;
  total_odds: number;
  potential_payout: number;
  status?: 'pending' | 'won' | 'lost' | 'canceled';
  created_at?: Date;
  updated_at?: Date;
}

export interface TicketWithDetails extends Ticket {
  username?: string;
  email?: string;
  selections?: any[];
}

export class TicketModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(ticket: Ticket): Promise<Ticket> {
    const query = `
      INSERT INTO tickets 
        (user_id, stake_amount, total_odds, potential_payout, status)
      VALUES 
        ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      ticket.user_id,
      ticket.stake_amount,
      ticket.total_odds,
      ticket.potential_payout,
      ticket.status || 'pending'
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<Ticket | null> {
    const query = 'SELECT * FROM tickets WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByIdWithDetails(id: number): Promise<TicketWithDetails | null> {
    const query = `
      SELECT t.*, u.username, u.email,
             json_agg(
               json_build_object(
                 'id', ti.id,
                 'selection', ti.selection,
                 'odds_value', ti.odds_value,
                 'status', ti.status,
                 'event_id', ti.event_id,
                 'odds_id', ti.odds_id,
                 'home_team', e.home_team,
                 'away_team', e.away_team,
                 'commence_time', e.commence_time
               )
             ) as selections
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
      LEFT JOIN events e ON ti.event_id = e.id
      WHERE t.id = $1
      GROUP BY t.id, u.username, u.email
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async findByUserId(
    userId: number, 
    page: number = 1, 
    limit: number = 10,
    status?: string
  ): Promise<{ tickets: TicketWithDetails[], total: number }> {
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE t.user_id = $1';
    const queryParams: any[] = [userId];
    let paramCounter = 2;
    
    if (status) {
      whereClause += ` AND t.status = $${paramCounter++}`;
      queryParams.push(status);
    }
    
    // Obtener total de registros
    const countQuery = `SELECT COUNT(*) FROM tickets t ${whereClause}`;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Obtener tickets con detalles
    const query = `
      SELECT t.*, u.username, u.email,
             json_agg(
               json_build_object(
                 'id', ti.id,
                 'selection', ti.selection,
                 'odds_value', ti.odds_value,
                 'status', ti.status,
                 'event_id', ti.event_id,
                 'odds_id', ti.odds_id,
                 'home_team', e.home_team,
                 'away_team', e.away_team,
                 'commence_time', e.commence_time
               )
             ) as selections
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
      LEFT JOIN events e ON ti.event_id = e.id
      ${whereClause}
      GROUP BY t.id, u.username, u.email
      ORDER BY t.created_at DESC
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;
    
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      tickets: result.rows,
      total
    };
  }

  async getAll(
    page: number = 1, 
    limit: number = 10,
    filters?: {
      status?: string;
      username?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<{ tickets: TicketWithDetails[], total: number }> {
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    if (filters?.status) {
      whereClause += ` AND t.status = $${paramCounter++}`;
      queryParams.push(filters.status);
    }
    
    if (filters?.username) {
      whereClause += ` AND u.username ILIKE $${paramCounter++}`;
      queryParams.push(`%${filters.username}%`);
    }
    
    if (filters?.dateFrom) {
      whereClause += ` AND t.created_at >= $${paramCounter++}`;
      queryParams.push(filters.dateFrom);
    }
    
    if (filters?.dateTo) {
      whereClause += ` AND t.created_at <= $${paramCounter++}`;
      queryParams.push(filters.dateTo);
    }
    
    // Obtener total de registros
    const countQuery = `
      SELECT COUNT(*) 
      FROM tickets t 
      JOIN users u ON t.user_id = u.id 
      ${whereClause}
    `;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Obtener tickets con detalles
    const query = `
      SELECT t.*, u.username, u.email,
             json_agg(
               json_build_object(
                 'id', ti.id,
                 'selection', ti.selection,
                 'odds_value', ti.odds_value,
                 'status', ti.status,
                 'event_id', ti.event_id,
                 'odds_id', ti.odds_id,
                 'home_team', e.home_team,
                 'away_team', e.away_team,
                 'commence_time', e.commence_time
               )
             ) as selections
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
      LEFT JOIN events e ON ti.event_id = e.id
      ${whereClause}
      GROUP BY t.id, u.username, u.email
      ORDER BY t.created_at DESC
      LIMIT $${paramCounter++} OFFSET $${paramCounter++}
    `;
    
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      tickets: result.rows,
      total
    };
  }

  async updateStatus(id: number, status: 'pending' | 'won' | 'lost' | 'canceled'): Promise<Ticket | null> {
    const query = `
      UPDATE tickets 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM tickets WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async getStatistics(userId?: number): Promise<any> {
    let query = `
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tickets,
        COUNT(*) FILTER (WHERE status = 'won') as won_tickets,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_tickets,
        COUNT(*) FILTER (WHERE status = 'canceled') as canceled_tickets,
        COALESCE(SUM(stake_amount), 0) as total_stake,
        COALESCE(SUM(potential_payout) FILTER (WHERE status = 'won'), 0) as total_winnings,
        COALESCE(AVG(stake_amount), 0) as average_stake,
        COALESCE(AVG(total_odds), 0) as average_odds
      FROM tickets
    `;
    
    const queryParams: any[] = [];
    
    if (userId) {
      query += ' WHERE user_id = $1';
      queryParams.push(userId);
    }
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows[0];
  }

  async getRecentTickets(limit: number = 10, userId?: number): Promise<TicketWithDetails[]> {
    let whereClause = '';
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    if (userId) {
      whereClause = 'WHERE t.user_id = $1';
      queryParams.push(userId);
      paramCounter++;
    }
    
    const query = `
      SELECT t.*, u.username, u.email,
             json_agg(
               json_build_object(
                 'id', ti.id,
                 'selection', ti.selection,
                 'odds_value', ti.odds_value,
                 'status', ti.status,
                 'event_id', ti.event_id,
                 'odds_id', ti.odds_id,
                 'home_team', e.home_team,
                 'away_team', e.away_team,
                 'commence_time', e.commence_time
               )
             ) as selections
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
      LEFT JOIN events e ON ti.event_id = e.id
      ${whereClause}
      GROUP BY t.id, u.username, u.email
      ORDER BY t.created_at DESC
      LIMIT $${paramCounter}
    `;
    
    queryParams.push(limit);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows;
  }

  
}

export default new TicketModel();