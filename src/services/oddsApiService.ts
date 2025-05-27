import axios from 'axios';
import dotenv from 'dotenv';
import pool from '../config/database';

dotenv.config();
const API_KEY = process.env.ODDS_API_KEY || '65195be01e91dc4830cbf3e3ea0a8bf0';
const API_BASE_URL = 'https://api.the-odds-api.com/v4';

export interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export interface Market {
  key: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Event {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export class OddsApiService {
  async getSports(): Promise<Sport[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/sports`, {
        params: {
          apiKey: API_KEY
        }
      });
      
      // Registrar la solicitud en la base de datos
      await this.logApiRequest('sports', response.status, response.data);
      
      // Verificar el uso de la API a través de las cabeceras
      console.log('Solicitudes restantes:', response.headers['x-requests-remaining']);
      console.log('Solicitudes utilizadas:', response.headers['x-requests-used']);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Error al obtener deportes:', error.response.status, error.response.data);
      } else {
        console.error('Error al obtener deportes:', error);
      }
      throw error;
    }
  }

  async getOddsByEvent(sportKey: string, markets: string = 'h2h,spreads,totals'): Promise<Event[]> {
    try {
      const regions = 'us'; // Regiones para las que obtener cuotas (us, uk, eu, au)
      const oddsFormat = 'american'; // Formato de las cuotas (decimal, american)
      const dateFormat = 'iso'; // Formato de fecha (iso, unix)
      
      const response = await axios.get(`${API_BASE_URL}/sports/${sportKey}/odds`, {
        params: {
          apiKey: API_KEY,
          regions,
          markets,
          oddsFormat,
          dateFormat
        }
      });
      
      // Registrar la solicitud en la base de datos
      await this.logApiRequest(`odds/${sportKey}`, response.status, response.data);
      
      // Verificar el uso de la API a través de las cabeceras
      console.log('Solicitudes restantes:', response.headers['x-requests-remaining']);
      console.log('Solicitudes utilizadas:', response.headers['x-requests-used']);
      console.log('Costo de la última solicitud:', response.headers['x-requests-last']);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(`Error al obtener cuotas para ${sportKey}:`, error.response.status, error.response.data);
      } else {
        console.error(`Error al obtener cuotas para ${sportKey}:`, error);
      }
      throw error;
    }
  }

  async getUpcomingEvents(): Promise<Event[]> {
    try {
      // 'upcoming' devuelve eventos próximos de todos los deportes
      const sportKey = 'upcoming';
      const regions = 'us';
      const markets = 'h2h,spreads,totals';
      const oddsFormat = 'american';
      const dateFormat = 'iso';
      
      const response = await axios.get(`${API_BASE_URL}/sports/${sportKey}/odds`, {
        params: {
          apiKey: API_KEY,
          regions,
          markets,
          oddsFormat,
          dateFormat
        }
      });
      
      // Registrar la solicitud en la base de datos
      await this.logApiRequest('upcoming', response.status, response.data);
      
      // Verificar el uso de la API a través de las cabeceras
      console.log('Solicitudes restantes:', response.headers['x-requests-remaining']);
      console.log('Solicitudes utilizadas:', response.headers['x-requests-used']);
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Error al obtener eventos próximos:', error.response.status, error.response.data);
      } else {
        console.error('Error al obtener eventos próximos:', error);
      }
      throw error;
    }
  }

  private async logApiRequest(endpoint: string, status: number, data: any): Promise<void> {
    try {
      const query = `
        INSERT INTO api_requests (endpoint, response_status, response_data)
        VALUES ($1, $2, $3)
      `;
      
      await pool.query(query, [endpoint, status, JSON.stringify(data)]);
    } catch (error) {
      console.error('Error al registrar solicitud a la API:', error);
    }
  }

  // Sincronizar deportes de la API con la base de datos
  async syncSports(): Promise<void> {
    try {
      const sports = await this.getSports();
      
      // Filtrar solo deportes objetivo (béisbol, fútbol, baloncesto, hockey)
      const targetGroups = ['Baseball', 'Soccer', 'Basketball', 'Ice Hockey'];
      const filteredSports = sports.filter(sport => 
        targetGroups.includes(sport.group) && 
        sport.active &&
        !sport.has_outrights
      );
      
      // Insertar o actualizar deportes en la base de datos
      for (const sport of filteredSports) {
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
        `;
        
        await pool.query(query, [
          sport.key,
          sport.title,
          sport.group,
          sport.description,
          sport.active
        ]);
      }
      
      console.log(`Sincronizados ${filteredSports.length} deportes con la base de datos`);
    } catch (error) {
      console.error('Error al sincronizar deportes:', error);
      throw error;
    }
  }

  // Sincronizar eventos y cuotas para un deporte específico
  async syncEventsBySport(sportKey: string): Promise<void> {
    try {
      const events = await this.getOddsByEvent(sportKey);
      
      // Buscar el id del deporte en la base de datos
      const sportQuery = 'SELECT id FROM sports WHERE api_sport_key = $1';
      const sportResult = await pool.query(sportQuery, [sportKey]);
      
      if (!sportResult.rows.length) {
        throw new Error(`Deporte con clave ${sportKey} no encontrado en la base de datos`);
      }
      
      const sportId = sportResult.rows[0].id;
      
      // Procesar cada evento
      for (const event of events) {
        // Verificar si ya existe competición para este deporte
        const competitionKey = `${sportKey}_regular`;
        const competitionName = `${event.sport_key.split('_')[0].toUpperCase()} Regular Season`;
        
        // Insertar o recuperar competición
        const compQuery = `
          INSERT INTO competitions (sport_id, api_competition_key, name, description, active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (api_competition_key) 
          DO UPDATE SET
            name = EXCLUDED.name,
            active = true,
            updated_at = NOW()
          RETURNING id
        `;
        
        const compResult = await pool.query(compQuery, [
          sportId,
          competitionKey,
          competitionName,
          competitionName
        ]);
        
        const competitionId = compResult.rows[0].id;
        
        // Insertar o actualizar evento
        const eventQuery = `
          INSERT INTO events (
            competition_id, api_event_id, home_team, away_team, commence_time, status
          )
          VALUES ($1, $2, $3, $4, $5, 'upcoming')
          ON CONFLICT (api_event_id) 
          DO UPDATE SET
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            commence_time = EXCLUDED.commence_time,
            updated_at = NOW()
          RETURNING id
        `;
        
        const eventResult = await pool.query(eventQuery, [
          competitionId,
          event.id,
          event.home_team,
          event.away_team,
          event.commence_time
        ]);
        
        const eventId = eventResult.rows[0].id;
        
        // Procesar las cuotas del evento
        if (event.bookmakers && event.bookmakers.length > 0) {
          // Usar el primer bookmaker disponible
          const bookmaker = event.bookmakers[0];
          
          for (const market of bookmaker.markets) {
            for (const outcome of market.outcomes) {
              // Determinar el tipo de mercado y resultado
              let marketType = 'h2h';
              let outcomeName = 'home';
              let handicap: number | null = null;
              let total: number | null = null;
              
              if (market.key === 'h2h') {
                if (outcome.name === event.home_team) {
                  outcomeName = 'home';
                } else if (outcome.name === event.away_team) {
                  outcomeName = 'away';
                } else {
                  outcomeName = 'draw';
                }
              } else if (market.key === 'spreads') {
                marketType = 'spread';
                outcomeName = outcome.name === event.home_team ? 'home' : 'away';
                handicap = outcome.point || 0;
              } else if (market.key === 'totals') {
                marketType = 'totals';
                outcomeName = outcome.name.toLowerCase().includes('over') ? 'over' : 'under';
                total = outcome.point || 0;
              }
              
              // Insertar o actualizar cuota
              const oddsQuery = `
                INSERT INTO odds (
                  event_id, bookmaker, market_type, outcome_name, price, handicap, total, last_update
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (event_id, bookmaker, market_type, outcome_name) 
                DO UPDATE SET
                  price = EXCLUDED.price,
                  handicap = EXCLUDED.handicap,
                  total = EXCLUDED.total,
                  last_update = EXCLUDED.last_update,
                  updated_at = NOW()
              `;
              
              await pool.query(oddsQuery, [
                eventId,
                bookmaker.key,
                marketType,
                outcomeName,
                outcome.price,
                handicap,
                total,
                bookmaker.last_update
              ]);
            }
          }
        }
      }
      
      console.log(`Sincronizados ${events.length} eventos para ${sportKey}`);
    } catch (error) {
      console.error(`Error al sincronizar eventos para ${sportKey}:`, error);
      throw error;
    }
  }
  
  // Obtener eventos con sus cuotas para la interfaz de usuario
  async getEventsWithOdds(sportKey: string, limit: number = 20): Promise<any[]> {
    try {
      // Si sportKey es 'all', obtener eventos de todos los deportes soportados
      if (sportKey === 'all') {
        const query = `
          SELECT e.id, e.api_event_id, e.home_team, e.away_team, e.commence_time, 
                 s.name as sport, c.name as competition
          FROM events e
          JOIN competitions c ON e.competition_id = c.id
          JOIN sports s ON c.sport_id = s.id
          WHERE e.status = 'upcoming' AND e.commence_time > NOW()
          ORDER BY e.commence_time
          LIMIT $1
        `;
        
        const result = await pool.query(query, [limit]);
        const events = result.rows;
        
        // Para cada evento, obtener sus cuotas
        for (const event of events) {
          const oddsQuery = `
            SELECT id, market_type, outcome_name, price, handicap, total, last_update
            FROM odds
            WHERE event_id = $1
            ORDER BY market_type, outcome_name
          `;
          
          const oddsResult = await pool.query(oddsQuery, [event.id]);
          event.odds = oddsResult.rows;
        }
        
        return events;
      } else {
        // Obtener eventos de un deporte específico
        const sportIdQuery = 'SELECT id FROM sports WHERE api_sport_key = $1';
        const sportResult = await pool.query(sportIdQuery, [sportKey]);
        
        if (!sportResult.rows.length) {
          throw new Error(`Deporte con clave ${sportKey} no encontrado`);
        }
        
        const sportId = sportResult.rows[0].id;
        
        const query = `
          SELECT e.id, e.api_event_id, e.home_team, e.away_team, e.commence_time, 
                 s.name as sport, c.name as competition
          FROM events e
          JOIN competitions c ON e.competition_id = c.id
          JOIN sports s ON c.sport_id = s.id
          WHERE s.id = $1 AND e.status = 'upcoming' AND e.commence_time > NOW()
          ORDER BY e.commence_time
          LIMIT $2
        `;
        
        const result = await pool.query(query, [sportId, limit]);
        const events = result.rows;
        
        // Para cada evento, obtener sus cuotas
        for (const event of events) {
          const oddsQuery = `
            SELECT id, market_type, outcome_name, price, handicap, total, last_update
            FROM odds
            WHERE event_id = $1
            ORDER BY market_type, outcome_name
          `;
          
          const oddsResult = await pool.query(oddsQuery, [event.id]);
          event.odds = oddsResult.rows;
        }
        
        return events;
      }
    } catch (error) {
      console.error('Error al obtener eventos con cuotas:', error);
      throw error;
    }
  }
}

export default new OddsApiService();