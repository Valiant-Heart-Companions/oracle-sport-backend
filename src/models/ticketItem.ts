import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface TicketItem {
  id?: number;
  ticket_id: number;
  event_id: number;
  odds_id: number;
  selection: string;
  odds_value: number;
  status?: 'pending' | 'won' | 'lost' | 'canceled';
  created_at?: Date;
  updated_at?: Date;
}

export interface TicketItemWithDetails extends TicketItem {
  home_team?: string;
  away_team?: string;
  commence_time?: Date;
  market_type?: string;
  outcome_name?: string;
}

export class TicketItemModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(ticketItem: TicketItem): Promise<TicketItem> {
    const query = `
      INSERT INTO ticket_items 
        (ticket_id, event_id, odds_id, selection, odds_value, status)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      ticketItem.ticket_id,
      ticketItem.event_id,
      ticketItem.odds_id,
      ticketItem.selection,
      ticketItem.odds_value,
      ticketItem.status || 'pending'
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async createMany(ticketItems: TicketItem[]): Promise<TicketItem[]> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      
      for (const item of ticketItems) {
        const query = `
          INSERT INTO ticket_items 
            (ticket_id, event_id, odds_id, selection, odds_value, status)
          VALUES 
            ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        
        const values = [
          item.ticket_id,
          item.event_id,
          item.odds_id,
          item.selection,
          item.odds_value,
          item.status || 'pending'
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

  async findById(id: number): Promise<TicketItem | null> {
    const query = 'SELECT * FROM ticket_items WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByIdWithDetails(id: number): Promise<TicketItemWithDetails | null> {
    const query = `
      SELECT ti.*, e.home_team, e.away_team, e.commence_time, 
             o.market_type, o.outcome_name
      FROM ticket_items ti
      JOIN events e ON ti.event_id = e.id
      JOIN odds o ON ti.odds_id = o.id
      WHERE ti.id = $1
    `;
    
    const result: QueryResult = await this.db.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async findByTicketId(ticketId: number): Promise<TicketItemWithDetails[]> {
    const query = `
      SELECT ti.*, e.home_team, e.away_team, e.commence_time, 
             o.market_type, o.outcome_name
      FROM ticket_items ti
      JOIN events e ON ti.event_id = e.id
      JOIN odds o ON ti.odds_id = o.id
      WHERE ti.ticket_id = $1
      ORDER BY ti.created_at ASC
    `;
    
    const result: QueryResult = await this.db.query(query, [ticketId]);
    return result.rows;
  }

  async findByEventId(eventId: number): Promise<TicketItem[]> {
    const query = 'SELECT * FROM ticket_items WHERE event_id = $1';
    const result: QueryResult = await this.db.query(query, [eventId]);
    
    return result.rows;
  }

  async updateStatus(id: number, status: 'pending' | 'won' | 'lost' | 'canceled'): Promise<TicketItem | null> {
    const query = `
      UPDATE ticket_items 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async updateStatusByTicketId(ticketId: number, status: 'pending' | 'won' | 'lost' | 'canceled'): Promise<TicketItem[]> {
    const query = `
      UPDATE ticket_items 
      SET status = $1, updated_at = NOW() 
      WHERE ticket_id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, ticketId]);
    return result.rows;
  }

  async updateStatusByEventId(eventId: number, status: 'pending' | 'won' | 'lost' | 'canceled'): Promise<TicketItem[]> {
    const query = `
      UPDATE ticket_items 
      SET status = $1, updated_at = NOW() 
      WHERE event_id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, eventId]);
    return result.rows;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM ticket_items WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async deleteByTicketId(ticketId: number): Promise<boolean> {
    const query = 'DELETE FROM ticket_items WHERE ticket_id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [ticketId]);
    
    return result.rows.length > 0;
  }

  async getStatisticsByEvent(eventId: number): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_selections,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_selections,
        COUNT(*) FILTER (WHERE status = 'won') as won_selections,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_selections,
        COALESCE(AVG(odds_value), 0) as average_odds
      FROM ticket_items
      WHERE event_id = $1
    `;
    
    const result: QueryResult = await this.db.query(query, [eventId]);
    return result.rows[0];
  }
}

export default new TicketItemModel();