import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface BankDetail {
  id?: number;
  user_id: number;
  bank_name: string;
  account_number: string;
  registered_phone: string;
  created_at?: Date;
  updated_at?: Date;
}

export class BankDetailModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(bankDetail: BankDetail): Promise<BankDetail> {
    const query = `
      INSERT INTO bank_details 
        (user_id, bank_name, account_number, registered_phone)
      VALUES 
        ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      bankDetail.user_id,
      bankDetail.bank_name,
      bankDetail.account_number,
      bankDetail.registered_phone
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<BankDetail | null> {
    const query = 'SELECT * FROM bank_details WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByUserId(userId: number): Promise<BankDetail[]> {
    const query = 'SELECT * FROM bank_details WHERE user_id = $1 ORDER BY id';
    const result: QueryResult = await this.db.query(query, [userId]);
    
    return result.rows;
  }

  async update(id: number, bankDetailData: Partial<BankDetail>): Promise<BankDetail | null> {
    const { bank_name, account_number, registered_phone } = bankDetailData;
    
    const queryParts: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;
    
    if (bank_name) {
      queryParts.push(`bank_name = $${paramCounter++}`);
      values.push(bank_name);
    }
    
    if (account_number) {
      queryParts.push(`account_number = $${paramCounter++}`);
      values.push(account_number);
    }
    
    if (registered_phone) {
      queryParts.push(`registered_phone = $${paramCounter++}`);
      values.push(registered_phone);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE bank_details 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM bank_details WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }
}

export default new BankDetailModel();