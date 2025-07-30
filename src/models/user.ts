import { Pool, QueryResult } from 'pg';
import pool from '../config/database';
import bcrypt from 'bcryptjs';

export interface User {
  id?: number;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  identification_number: string;
  email: string;
  phone: string;
  country: string;
  balance?: number;
  role?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class UserModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(user: User): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    const query = `
      INSERT INTO users 
        (username, password, first_name, last_name, identification_number, email, phone, country, role, balance)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      user.username,
      hashedPassword,
      user.first_name,
      user.last_name,
      user.identification_number,
      user.email,
      user.phone,
      user.country,
      user.role || 'user',
      user.balance || 0
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result: QueryResult = await this.db.query(query, [username]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result: QueryResult = await this.db.query(query, [email]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async update(id: number, userData: Partial<User>): Promise<User | null> {
    // No permitir actualizar username o role a través de esta función
    const { password, first_name, last_name, email, phone, country } = userData;
    
    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }
    
    const queryParts: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;
    
    if (first_name) {
      queryParts.push(`first_name = $${paramCounter++}`);
      values.push(first_name);
    }
    
    if (last_name) {
      queryParts.push(`last_name = $${paramCounter++}`);
      values.push(last_name);
    }
    
    if (email) {
      queryParts.push(`email = $${paramCounter++}`);
      values.push(email);
    }
    
    if (phone) {
      queryParts.push(`phone = $${paramCounter++}`);
      values.push(phone);
    }
    
    if (country) {
      queryParts.push(`country = $${paramCounter++}`);
      values.push(country);
    }
    
    if (hashedPassword) {
      queryParts.push(`password = $${paramCounter++}`);
      values.push(hashedPassword);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE users 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async updateBalance(id: number, amount: number): Promise<User | null> {
    const query = `
      UPDATE users 
      SET balance = balance + $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, [amount, id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }

  async getAll(page = 1, limit = 10): Promise<{ users: User[], total: number }> {
    const offset = (page - 1) * limit;
    
    const countQuery = 'SELECT COUNT(*) FROM users';
    const countResult: QueryResult = await this.db.query(countQuery);
    const total = parseInt(countResult.rows[0].count, 10);
    
    const query = `
      SELECT id, username, first_name, last_name, email, phone, country, balance, role, created_at, updated_at 
      FROM users 
      ORDER BY id 
      LIMIT $1 OFFSET $2
    `;
    
    const result: QueryResult = await this.db.query(query, [limit, offset]);
    
    return {
      users: result.rows,
      total
    };
  }

  async comparePassword(providedPassword: string, storedPassword: string): Promise<boolean> {
    return bcrypt.compare(providedPassword, storedPassword);
  }
}

export default new UserModel();