import { Pool, QueryResult } from 'pg';
import pool from '../config/database';

export interface CryptoDetail {
  id?: number;
  user_id: number;
  wallet_address: string;
  network: string;
  created_at?: Date;
  updated_at?: Date;
}

export class CryptoDetailModel {
  private db: Pool;

  constructor() {
    this.db = pool;
  }

  async create(cryptoDetail: CryptoDetail): Promise<CryptoDetail> {
    const query = `
      INSERT INTO crypto_details 
        (user_id, wallet_address, network)
      VALUES 
        ($1, $2, $3)
      RETURNING *
    `;
    
    const values = [
      cryptoDetail.user_id,
      cryptoDetail.wallet_address,
      cryptoDetail.network
    ];
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows[0];
  }

  async findById(id: number): Promise<CryptoDetail | null> {
    const query = 'SELECT * FROM crypto_details WHERE id = $1';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length ? result.rows[0] : null;
  }

  async findByUserId(userId: number): Promise<CryptoDetail[]> {
    const query = 'SELECT * FROM crypto_details WHERE user_id = $1 ORDER BY id';
    const result: QueryResult = await this.db.query(query, [userId]);
    
    return result.rows;
  }

  async update(id: number, cryptoDetailData: Partial<CryptoDetail>): Promise<CryptoDetail | null> {
    const { wallet_address, network } = cryptoDetailData;
    
    const queryParts: string[] = [];
    const values: (string | number | Date)[] = [];
    let paramCounter = 1;
    
    if (wallet_address) {
      queryParts.push(`wallet_address = $${paramCounter++}`);
      values.push(wallet_address);
    }
    
    if (network) {
      queryParts.push(`network = $${paramCounter++}`);
      values.push(network);
    }
    
    queryParts.push(`updated_at = $${paramCounter++}`);
    values.push(new Date());
    
    if (queryParts.length === 0) {
      return this.findById(id);
    }
    
    values.push(id);
    
    const query = `
      UPDATE crypto_details 
      SET ${queryParts.join(', ')} 
      WHERE id = $${paramCounter} 
      RETURNING *
    `;
    
    const result: QueryResult = await this.db.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM crypto_details WHERE id = $1 RETURNING id';
    const result: QueryResult = await this.db.query(query, [id]);
    
    return result.rows.length > 0;
  }
}

export default new CryptoDetailModel();