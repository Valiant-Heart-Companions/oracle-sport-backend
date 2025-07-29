import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface Deposit {
  id?: number;
  user_id: number;
  amount: number;
  method: 'bank_transfer' | 'mobile_payment' | 'binance';
  reference_number?: string;
  transaction_hash?: string;
  status?: 'pending' | 'completed' | 'rejected';
  deposit_date: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface DepositWithUser extends Deposit {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export class DepositModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(deposit: Deposit): Promise<Deposit> {
    const query = `
      INSERT INTO deposits 
        (user_id, amount, method, reference_number, transaction_hash, status, deposit_date)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      deposit.user_id,
      deposit.amount,
      deposit.method,
      deposit.reference_number || null,
      deposit.transaction_hash || null,
      deposit.status || 'pending',
      deposit.deposit_date
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<Deposit | null> {
    const query = 'SELECT * FROM deposits WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByUserId(
    userId: number, 
    page: number = 1, 
    limit: number = 10,
    status?: string
  ): Promise<{ deposits: Deposit[], total: number }> {
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM deposits WHERE user_id = $1';
    const queryParams: any[] = [userId];
    let paramCounter = 2;
    
    // Filtrar por estado si se proporciona
    if (status) {
      query += ` AND status = $${paramCounter++}`;
      queryParams.push(status);
    }
    
    // Obtener total de registros
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Añadir ordenamiento y paginación
    query += ` ORDER BY created_at DESC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      deposits: result.rows,
      total
    };
  }

  async getAll(
    page: number = 1, 
    limit: number = 10,
    filters?: {
      status?: string;
      method?: string;
      username?: string;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ): Promise<{ deposits: DepositWithUser[], total: number }> {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, u.username, u.email, u.first_name, u.last_name
      FROM deposits d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    let paramCounter = 1;
    
    // Aplicar filtros
    if (filters?.status) {
      query += ` AND d.status = $${paramCounter++}`;
      queryParams.push(filters.status);
    }
    
    if (filters?.method) {
      query += ` AND d.method = $${paramCounter++}`;
      queryParams.push(filters.method);
    }
    
    if (filters?.username) {
      query += ` AND u.username ILIKE $${paramCounter++}`;
      queryParams.push(`%${filters.username}%`);
    }
    
    if (filters?.dateFrom) {
      query += ` AND d.deposit_date >= $${paramCounter++}`;
      queryParams.push(filters.dateFrom);
    }
    
    if (filters?.dateTo) {
      query += ` AND d.deposit_date <= $${paramCounter++}`;
      queryParams.push(filters.dateTo);
    }
    
    // Obtener total de registros
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult: QueryResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Añadir ordenamiento y paginación
    query += ` ORDER BY d.created_at DESC LIMIT $${paramCounter++} OFFSET $${paramCounter++}`;
    queryParams.push(limit, offset);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    
    return {
      deposits: result.rows,
      total
    };
  }

  async updateStatus(id: number, status: 'pending' | 'completed' | 'rejected'): Promise<Deposit | null> {
    const query = `
      UPDATE deposits 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [status, id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async update(id: number, depositData: Partial<Deposit>): Promise<Deposit | null> {
    const { amount, method, reference_number, transaction_hash, status, deposit_date } = depositData;
    
    const queryParts = [];
    const values = [];
    let paramCounter = 1;
    
    if (amount !== undefined) {
      queryParts.push(`amount = $${paramCounter++}`);
      values.push(amount);
    }
    
    if (method) {
      queryParts.push(`method = $${paramCounter++}`);
      values.push(method);
    }
    
    if (reference_number !== undefined) {
      queryParts.push(`reference_number = $${paramCounter++}`);
      values.push(reference_number);
    }
    
    if (transaction_hash !== undefined) {
      queryParts.push(`transaction_hash = $${paramCounter++}`);
      values.push(transaction_hash);
    }
    
    if (status) {
      queryParts.push(`status = $${paramCounter++}`);
      values.push(status);
    }
    
    if (deposit_date) {
      queryParts.push(`deposit_date = $${paramCounter++}`);
      values.push(deposit_date);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE deposits 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM deposits WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async getDepositStatistics(userId?: number): Promise<any> {
    let query = `
      SELECT 
        COUNT(*) as total_deposits,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_deposits,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_deposits,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_deposits,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as completed_amount,
        COALESCE(AVG(amount), 0) as average_amount,
        COUNT(DISTINCT method) as methods_used
      FROM deposits
    `;
    
    const queryParams: any[] = [];
    
    if (userId) {
      query += ' WHERE user_id = $1';
      queryParams.push(userId);
    }
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows[0];
  }

  async getRecentDeposits(limit: number = 10, userId?: number): Promise<DepositWithUser[]> {
    let query = `
      SELECT d.*, u.username, u.email, u.first_name, u.last_name
      FROM deposits d
      JOIN users u ON d.user_id = u.id
    `;
    
    const queryParams: any[] = [];
    
    if (userId) {
      query += ' WHERE d.user_id = $1';
      queryParams.push(userId);
    }
    
    query += ' ORDER BY d.created_at DESC LIMIT $' + (queryParams.length + 1);
    queryParams.push(limit);
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows;
  }

  async getDepositsByDateRange(
    startDate: Date, 
    endDate: Date, 
    userId?: number
  ): Promise<Deposit[]> {
    let query = `
      SELECT * FROM deposits 
      WHERE deposit_date >= $1 AND deposit_date <= $2
    `;
    
    const queryParams: any[] = [startDate, endDate];
    
    if (userId) {
      query += ' AND user_id = $3';
      queryParams.push(userId);
    }
    
    query += ' ORDER BY deposit_date DESC';
    
    const result: QueryResult = await this.db.query(query, queryParams);
    return result.rows;
  }
}

export default new DepositModel();