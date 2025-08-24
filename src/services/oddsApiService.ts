import axios from 'axios';
import { EventModel } from '../models/event';
import { OddsModel, Odds } from '../models/odd';
import { CompetitionModel } from '../models/competition';
import { SportModel } from '../models/sport';

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

export interface OddsApiMarket {
  key: string;
  last_update?: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface ProcessedEvent {
  id: number;
  api_event_id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: Date;
  odds: ProcessedOdds[];
}

export interface ProcessedOdds {
  market_type: string;
  outcome_name: string;
  price: number;
  handicap?: number;
  total?: number;
}

class OddsApiService {
  private apiKey: string;
  private baseUrl: string;
  private eventModel: EventModel;
  private oddsModel: OddsModel;
  private competitionModel: CompetitionModel;
  private sportModel: SportModel;

  constructor() {
    this.apiKey = process.env.ODDS_API_KEY || '';
    this.baseUrl = 'https://api.the-odds-api.com/v4';
    this.eventModel = new EventModel();
    this.oddsModel = new OddsModel();
    this.competitionModel = new CompetitionModel();
    this.sportModel = new SportModel();

    if (!this.apiKey) {
      console.warn('⚠️  ODDS_API_KEY no está configurada en las variables de entorno');
    }
  }

  // Obtener lista de deportes disponibles
  async getSports(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/sports/`, {
        params: {
          apiKey: this.apiKey
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Error obteniendo deportes de Odds API:', error);
      throw new Error('Error al conectar con la API de deportes');
    }
  }

  // Obtener eventos de un deporte específico
  async getEventsBySport(
    sportKey: string, 
    options: {
      regions?: string;
      markets?: string;
      oddsFormat?: string;
      dateFormat?: string;
    } = {}
  ): Promise<OddsApiEvent[]> {
    try {
      const {
        regions = 'us,us2',
        markets = 'h2h,spreads,totals',
        oddsFormat = 'american',
        dateFormat = 'iso'
      } = options;

      const response = await axios.get(`${this.baseUrl}/sports/${sportKey}/odds/`, {
        params: {
          apiKey: this.apiKey,
          regions,
          markets,
          oddsFormat,
          dateFormat
        },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      console.error(`Error obteniendo eventos para ${sportKey}:`, error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('API Key inválida para The Odds API');
        }
        if (error.response?.status === 429) {
          throw new Error('Límite de solicitudes excedido para The Odds API');
        }
      }
      throw new Error('Error al obtener eventos de la API');
    }
  }

  async syncSports(): Promise<void> {
    try {
      
      const url = `${this.baseUrl}/sports/?apiKey=${this.apiKey}`;
      const { data } = await axios.get(url);
      const pool = require('../config/database').default;
      for (const sport of data) {
        await pool.query(
          `
          INSERT INTO sports (key, group_name, title, active)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (key) DO UPDATE
          SET group_name = EXCLUDED.group_name,
              title = EXCLUDED.title,
              active = EXCLUDED.active
          `,
          [
            sport.key,
            sport.title,
            sport.active ? 1 : 0,
            sport.group,
            sport.details ?? null,
          ]
        );
      }

      console.log("✅ Deportes sincronizados correctamente");
    } catch (error) {
      console.error("❌ Error al sincronizar deportes:", error);
      throw error;
    }
  }

  /**
   * Sincroniza los eventos de un deporte específico desde Odds API con la tabla `events`
   * @param sportKey clave del deporte (ejemplo: "soccer_epl")
   */
  async syncEventsBySport(sportKey: string): Promise<void> {
    try {
      const url = `${this.baseUrl}/sports/${sportKey}/odds/?apiKey=${this.apiKey}&regions=us&markets=h2h,spreads,totals`;
      const { data } = await axios.get(url);
      const pool = require('../config/database').default;
      for (const event of data) {
        await pool.query(
           `
          INSERT INTO events (id, sport_key, sport_title, commence_time, home_team, away_team)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE
          SET sport_key = EXCLUDED.sport_key,
              sport_title = EXCLUDED.sport_title,
              commence_time = EXCLUDED.commence_time,
              home_team = EXCLUDED.home_team,
              away_team = EXCLUDED.away_team
          `,
          [
            event.id,
            event.sport_key,
            event.sport_title,
            event.home_team,
            event.away_team,
            event.commence_time,
            JSON.stringify(event.bookmakers ?? []),
          ]
        );
      }

      console.log(`✅ Eventos de ${sportKey} sincronizados correctamente`);
    } catch (error) {
      console.error(`❌ Error al sincronizar eventos de ${sportKey}:`, error);
      throw error;
    }
  }
  

  // Procesar y transformar datos de la API
  private processApiEvents(apiEvents: OddsApiEvent[]): ProcessedEvent[] {
    return apiEvents.map(event => {
      const processedOdds: ProcessedOdds[] = [];

      // Procesar todas las casas de apuestas y sus mercados
      event.bookmakers.forEach(bookmaker => {
        bookmaker.markets.forEach(market => {
          market.outcomes.forEach(outcome => {
            let processedOdd: ProcessedOdds;

            switch (market.key) {
              case 'h2h':
                processedOdd = {
                  market_type: 'h2h',
                  outcome_name: this.mapTeamToOutcome(outcome.name, event.home_team, event.away_team),
                  price: outcome.price
                };
                break;

              case 'spreads':
                processedOdd = {
                  market_type: 'spread',
                  outcome_name: this.mapTeamToOutcome(outcome.name, event.home_team, event.away_team),
                  price: outcome.price,
                  handicap: outcome.point
                };
                break;

              case 'totals':
                processedOdd = {
                  market_type: 'totals',
                  outcome_name: outcome.name.toLowerCase() === 'over' ? 'over' : 'under',
                  price: outcome.price,
                  total: outcome.point
                };
                break;

              default:
                return; // Skip unknown market types
            }

            processedOdds.push(processedOdd);
          });
        });
      });

      // Calcular mejores cuotas por mercado
      const bestOdds = this.calculateBestOdds(processedOdds);

      return {
        id: 0, // Se asignará al guardar en DB
        api_event_id: event.id,
        sport_key: event.sport_key,
        home_team: event.home_team,
        away_team: event.away_team,
        commence_time: new Date(event.commence_time),
        odds: bestOdds
      };
    });
  }

  // Mapear nombres de equipos a outcomes estándar
  private mapTeamToOutcome(teamName: string, homeTeam: string, awayTeam: string): string {
    if (teamName === homeTeam) return 'home';
    if (teamName === awayTeam) return 'away';
    return 'draw'; // Para deportes que permiten empate
  }

  // Calcular las mejores cuotas por mercado
  private calculateBestOdds(allOdds: ProcessedOdds[]): ProcessedOdds[] {
    const bestOddsMap = new Map<string, ProcessedOdds>();

    allOdds.forEach(odd => {
      const key = `${odd.market_type}_${odd.outcome_name}_${odd.handicap || ''}_${odd.total || ''}`;
      const existing = bestOddsMap.get(key);

      if (!existing || this.isBetterOdd(odd, existing)) {
        bestOddsMap.set(key, odd);
      }
    });

    return Array.from(bestOddsMap.values());
  }

  // Determinar si una cuota es mejor que otra
  private isBetterOdd(newOdd: ProcessedOdds, existingOdd: ProcessedOdds): boolean {
    // Para cuotas americanas, números más altos son mejores para favoritos (negativos)
    // y números más altos son mejores para underdog (positivos)
    if (newOdd.price >= 0 && existingOdd.price >= 0) {
      return newOdd.price > existingOdd.price;
    }
    if (newOdd.price < 0 && existingOdd.price < 0) {
      return newOdd.price > existingOdd.price; // -110 es mejor que -120
    }
    if (newOdd.price >= 0 && existingOdd.price < 0) {
      return true; // Underdog es siempre mejor que favorito
    }
    return false; // Favorito vs underdog, mantener el existente
  }

  // Sincronizar evento con la base de datos
  async syncEventToDatabase(processedEvent: ProcessedEvent): Promise<number> {
    try {
      // Buscar o crear el deporte
      let sport = await this.sportModel.findByApiKey(processedEvent.sport_key);
      if (!sport) {
        // Si el deporte no existe, crearlo
        sport = await this.sportModel.create({
          api_sport_key: processedEvent.sport_key,
          name: processedEvent.sport_key.replace(/_/g, ' ').toUpperCase(),
          group_name: this.getSportGroup(processedEvent.sport_key),
          description: `Auto-imported from Odds API`,
          active: true
        });
      }

      // Buscar o crear la competición (usando sport_key como nombre de competición)
      let competition = await this.competitionModel.findByName(
        this.getCompetitionName(processedEvent.sport_key), 
        sport.id
      );
      
      if (!competition) {
        competition = await this.competitionModel.create({
          sport_id: sport.id!,
          name: this.getCompetitionName(processedEvent.sport_key),
          country: 'International',
          active: true
        });
      }

      // Verificar si el evento ya existe
      let event = await this.eventModel.findByApiId(processedEvent.api_event_id);
      
      if (!event) {
        // Crear nuevo evento
        event = await this.eventModel.create({
          competition_id: competition.id!,
          api_event_id: processedEvent.api_event_id,
          home_team: processedEvent.home_team,
          away_team: processedEvent.away_team,
          commence_time: processedEvent.commence_time,
          status: 'upcoming'
        });
      } else {
        // Actualizar evento existente
        event = await this.eventModel.update(event.id!, {
          home_team: processedEvent.home_team,
          away_team: processedEvent.away_team,
          commence_time: processedEvent.commence_time,
          status: 'upcoming'
        });
      }

      // Eliminar cuotas anteriores del evento
      await this.oddsModel.deleteByEventId(event?.id!);

      // Insertar nuevas cuotas
      for (const odd of processedEvent.odds) {
        
        let _odd: Odds = {
          event_id: event?.id!,
          market_type: odd.market_type,
          outcome_name: odd.outcome_name,
          price: odd.price,
          handicap: odd.handicap,
          total: odd.total,
          bookmaker: 'Corredor Virtual',
        };
        //console.log(_odd)
        await this.oddsModel.create(_odd);
      }

      return event?.id!;
    } catch (error) {
      console.error('Error sincronizando evento* con base de datos:', error);
      throw error;
    }
  }

  // Obtener nombre de competición basado en sport_key
  private getCompetitionName(sportKey: string): string {
    const competitionMap: { [key: string]: string } = {
      'americanfootball_nfl': 'NFL',
      'basketball_nba': 'NBA',
      'baseball_mlb': 'MLB',
      'icehockey_nhl': 'NHL',
      'soccer_epl': 'Premier League',
      'soccer_spain_la_liga': 'La Liga',
      'soccer_italy_serie_a': 'Serie A',
      'soccer_germany_bundesliga': 'Bundesliga',
      'soccer_france_ligue_one': 'Ligue 1'
    };

    return competitionMap[sportKey] || sportKey.replace(/_/g, ' ').toUpperCase();
  }

  // Obtener grupo de deporte
  private getSportGroup(sportKey: string): string {
    if (sportKey.includes('football')) return 'American Football';
    if (sportKey.includes('basketball')) return 'Basketball';
    if (sportKey.includes('baseball')) return 'Baseball';
    if (sportKey.includes('hockey')) return 'Ice Hockey';
    if (sportKey.includes('soccer')) return 'Soccer';
    if (sportKey.includes('tennis')) return 'Tennis';
    return 'Other';
  }

  // Método principal para obtener y sincronizar eventos
  async fetchAndSyncEvents(sportKey: string): Promise<ProcessedEvent[]> {
    try {
      console.log(`🔄 Obteniendo eventos para ${sportKey} desde Odds API...`);
      
      const apiEvents = await this.getEventsBySport(sportKey);
      console.log(`📥 Obtenidos ${apiEvents.length} eventos de la API`);
      
      const processedEvents = this.processApiEvents(apiEvents);
      console.log(`⚙️  Procesados ${processedEvents.length} eventos`);

      // Sincronizar cada evento con la base de datos
      for (let event of processedEvents) {
        try {
          const eventId = await this.syncEventToDatabase(event);
          event.id = eventId;
          console.log(`✅ Evento sincronizado: ${event.away_team} @ ${event.home_team} (ID: ${eventId})`);
        } catch (error) {
          console.error(`❌ Error sincronizando evento ${event.api_event_id}:`, error);
        }
      }

      return processedEvents;
    } catch (error) {
      console.error(`Error en fetchAndSyncEvents para ${sportKey}:`, error);
      throw error;
    }
  }

  // Validar y sincronizar evento específico por API ID
  async validateAndSyncEvent(apiEventId: string): Promise<number | null> {
    try {
      // Buscar si el evento ya existe en nuestra DB
      const existingEvent = await this.eventModel.findByApiId(apiEventId);
      if (existingEvent) {
        return existingEvent.id!;
      }

      // Si no existe, necesitamos obtenerlo de la API
      // Esto requiere conocer el sport_key, así que buscaremos en varios deportes principales
      const mainSports = [
        'americanfootball_nfl',
        'basketball_nba', 
        'baseball_mlb',
        'icehockey_nhl',
        'soccer_epl'
      ];

      for (const sportKey of mainSports) {
        try {
          const events = await this.getEventsBySport(sportKey);
          const targetEvent = events.find(e => e.id === apiEventId);
          
          if (targetEvent) {
            const processedEvents = this.processApiEvents([targetEvent]);
            const eventId = await this.syncEventToDatabase(processedEvents[0]);
            console.log(`✅ Evento validado y sincronizado: ${targetEvent.away_team} @ ${targetEvent.home_team}`);
            return eventId;
          }
        } catch (error) {
          console.warn(`No se pudo buscar en ${sportKey}:`, error);
          continue;
        }
      }

      console.warn(`⚠️  Evento ${apiEventId} no encontrado en ningún deporte`);
      return null;
    } catch (error) {
      console.error('Error validando evento:', error);
      throw error;
    }
  }

  // Obtener información de uso de la API
  async getApiUsage(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/sports/`, {
        params: {
          apiKey: this.apiKey
        }
      });

      return {
        remaining: response.headers['x-requests-remaining'],
        used: response.headers['x-requests-used'],
        resetTime: response.headers['x-requests-reset']
      };
    } catch (error) {
      console.error('Error obteniendo uso de API:', error);
      return null;
    }
  }
}

export default new OddsApiService();