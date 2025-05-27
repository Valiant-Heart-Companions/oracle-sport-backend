CREATE DATABASE oracle_sport
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Spanish_Venezuela.1252'
    LC_CTYPE = 'Spanish_Venezuela.1252'
    LOCALE_PROVIDER = 'libc'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1
    IS_TEMPLATE = False;


CREATE TABLE IF NOT EXISTS public.api_requests
(
    id integer NOT NULL DEFAULT nextval('api_requests_id_seq'::regclass),
    endpoint character varying(255) COLLATE pg_catalog."default" NOT NULL,
    response_status integer,
    response_data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT api_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bank_details
(
    id integer NOT NULL DEFAULT nextval('bank_details_id_seq'::regclass),
    user_id integer NOT NULL,
    bank_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    account_number character varying(100) COLLATE pg_catalog."default" NOT NULL,
    registered_phone character varying(20) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bank_details_pkey PRIMARY KEY (id),
    CONSTRAINT bank_details_user_id_bank_name_account_number_key UNIQUE (user_id, bank_name, account_number),
    CONSTRAINT bank_details_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.competitions
(
    id integer NOT NULL DEFAULT nextval('competitions_id_seq'::regclass),
    sport_id integer NOT NULL,
    api_competition_key character varying(100) COLLATE pg_catalog."default",
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT competitions_pkey PRIMARY KEY (id),
    CONSTRAINT competitions_api_competition_key_key UNIQUE (api_competition_key),
    CONSTRAINT competitions_sport_id_fkey FOREIGN KEY (sport_id)
        REFERENCES public.sports (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competitions_active
    ON public.competitions USING btree
    (active ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS public.crypto_details
(
    id integer NOT NULL DEFAULT nextval('crypto_details_id_seq'::regclass),
    user_id integer NOT NULL,
    wallet_address character varying(255) COLLATE pg_catalog."default" NOT NULL,
    network character varying(50) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT crypto_details_pkey PRIMARY KEY (id),
    CONSTRAINT crypto_details_user_id_wallet_address_network_key UNIQUE (user_id, wallet_address, network),
    CONSTRAINT crypto_details_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.deposits
(
    id integer NOT NULL DEFAULT nextval('deposits_id_seq'::regclass),
    user_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    method character varying(20) COLLATE pg_catalog."default" NOT NULL,
    reference_number character varying(100) COLLATE pg_catalog."default",
    transaction_hash character varying(255) COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    deposit_date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deposits_pkey PRIMARY KEY (id),
    CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.deposits
    OWNER to postgres;
-- Index: idx_deposits_user_id

-- DROP INDEX IF EXISTS public.idx_deposits_user_id;

CREATE INDEX IF NOT EXISTS idx_deposits_user_id
    ON public.deposits USING btree
    (user_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- Trigger: deposit_completed_trigger

-- DROP TRIGGER IF EXISTS deposit_completed_trigger ON public.deposits;

CREATE OR REPLACE TRIGGER deposit_completed_trigger
    AFTER INSERT OR UPDATE 
    ON public.deposits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_balance_after_deposit();

CREATE TABLE IF NOT EXISTS public.events
(
    id integer NOT NULL DEFAULT nextval('events_id_seq'::regclass),
    competition_id integer NOT NULL,
    api_event_id character varying(100) COLLATE pg_catalog."default",
    home_team character varying(100) COLLATE pg_catalog."default" NOT NULL,
    away_team character varying(100) COLLATE pg_catalog."default" NOT NULL,
    commence_time timestamp without time zone NOT NULL,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'upcoming'::character varying,
    result character varying(20) COLLATE pg_catalog."default" DEFAULT NULL::character varying,
    score_home integer,
    score_away integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT events_pkey PRIMARY KEY (id),
    CONSTRAINT events_api_event_id_key UNIQUE (api_event_id),
    CONSTRAINT events_competition_id_fkey FOREIGN KEY (competition_id)
        REFERENCES public.competitions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.events
    OWNER to postgres;
-- Index: idx_events_commence_time

-- DROP INDEX IF EXISTS public.idx_events_commence_time;

CREATE INDEX IF NOT EXISTS idx_events_commence_time
    ON public.events USING btree
    (commence_time ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_events_status

-- DROP INDEX IF EXISTS public.idx_events_status;

CREATE INDEX IF NOT EXISTS idx_events_status
    ON public.events USING btree
    (status COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;


CREATE TABLE IF NOT EXISTS public.odds
(
    id integer NOT NULL DEFAULT nextval('odds_id_seq'::regclass),
    event_id integer NOT NULL,
    bookmaker character varying(50) COLLATE pg_catalog."default" NOT NULL,
    market_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    outcome_name character varying(20) COLLATE pg_catalog."default" NOT NULL,
    price numeric(10,2) NOT NULL,
    handicap numeric(5,1),
    total numeric(5,1),
    last_update timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT odds_pkey PRIMARY KEY (id),
    CONSTRAINT odds_event_id_fkey FOREIGN KEY (event_id)
        REFERENCES public.events (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

ALTER TABLE IF EXISTS public.odds
    OWNER to postgres;
-- Index: idx_odds_event_id

-- DROP INDEX IF EXISTS public.idx_odds_event_id;

CREATE INDEX IF NOT EXISTS idx_odds_event_id
    ON public.odds USING btree
    (event_id ASC NULLS LAST)
    TABLESPACE pg_default;

    CREATE TABLE IF NOT EXISTS public.sports
(
    id integer NOT NULL DEFAULT nextval('sports_id_seq'::regclass),
    api_sport_key character varying(100) COLLATE pg_catalog."default" NOT NULL,
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    group_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sports_pkey PRIMARY KEY (id),
    CONSTRAINT sports_api_sport_key_key UNIQUE (api_sport_key)
)

ALTER TABLE IF EXISTS public.sports
    OWNER to postgres;
-- Index: idx_sports_active

-- DROP INDEX IF EXISTS public.idx_sports_active;

CREATE INDEX IF NOT EXISTS idx_sports_active
    ON public.sports USING btree
    (active ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS public.ticket_items
(
    id integer NOT NULL DEFAULT nextval('ticket_items_id_seq'::regclass),
    ticket_id integer NOT NULL,
    event_id integer NOT NULL,
    odds_id integer NOT NULL,
    odds_value numeric(10,2) NOT NULL,
    bet_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    selection character varying(20) COLLATE pg_catalog."default" NOT NULL,
    handicap numeric(5,1),
    total numeric(5,1),
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ticket_items_pkey PRIMARY KEY (id),
    CONSTRAINT ticket_items_event_id_fkey FOREIGN KEY (event_id)
        REFERENCES public.events (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT ticket_items_odds_id_fkey FOREIGN KEY (odds_id)
        REFERENCES public.odds (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT ticket_items_ticket_id_fkey FOREIGN KEY (ticket_id)
        REFERENCES public.tickets (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ticket_items
    OWNER to postgres;
-- Index: idx_ticket_items_ticket_id

-- DROP INDEX IF EXISTS public.idx_ticket_items_ticket_id;

CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket_id
    ON public.ticket_items USING btree
    (ticket_id ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS public.tickets
(
    id integer NOT NULL DEFAULT nextval('tickets_id_seq'::regclass),
    user_id integer NOT NULL,
    total_odds numeric(10,2) NOT NULL,
    stake_amount numeric(15,2) NOT NULL,
    potential_payout numeric(15,2) NOT NULL,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tickets_pkey PRIMARY KEY (id),
    CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.tickets
    OWNER to postgres;
-- Index: idx_tickets_status

-- DROP INDEX IF EXISTS public.idx_tickets_status;

CREATE INDEX IF NOT EXISTS idx_tickets_status
    ON public.tickets USING btree
    (status COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_tickets_user_id

-- DROP INDEX IF EXISTS public.idx_tickets_user_id;

CREATE INDEX IF NOT EXISTS idx_tickets_user_id
    ON public.tickets USING btree
    (user_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- Trigger: bet_settlement_trigger

-- DROP TRIGGER IF EXISTS bet_settlement_trigger ON public.tickets;

CREATE OR REPLACE TRIGGER bet_settlement_trigger
    AFTER UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_balance_after_bet_settlement();

-- Trigger: check_balance_before_bet_trigger

-- DROP TRIGGER IF EXISTS check_balance_before_bet_trigger ON public.tickets;

CREATE OR REPLACE TRIGGER check_balance_before_bet_trigger
    BEFORE INSERT
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.check_user_balance_for_bet();  

CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    password character varying(255) COLLATE pg_catalog."default" NOT NULL,
    first_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    last_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    identification_number character varying(50) COLLATE pg_catalog."default" NOT NULL,
    email character varying(100) COLLATE pg_catalog."default" NOT NULL,
    phone character varying(20) COLLATE pg_catalog."default" NOT NULL,
    country character varying(50) COLLATE pg_catalog."default" NOT NULL,
    balance numeric(15,2) DEFAULT 0.00,
    role character varying(20) COLLATE pg_catalog."default" DEFAULT 'user'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_identification_number_key UNIQUE (identification_number),
    CONSTRAINT users_username_key UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS public.withdrawals
(
    id integer NOT NULL DEFAULT nextval('withdrawals_id_seq'::regclass),
    user_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    method character varying(20) COLLATE pg_catalog."default" NOT NULL,
    bank_detail_id integer,
    crypto_detail_id integer,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT withdrawals_pkey PRIMARY KEY (id),
    CONSTRAINT withdrawals_bank_detail_id_fkey FOREIGN KEY (bank_detail_id)
        REFERENCES public.bank_details (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT withdrawals_crypto_detail_id_fkey FOREIGN KEY (crypto_detail_id)
        REFERENCES public.crypto_details (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT withdrawals_check CHECK (method::text = 'mobile_payment'::text AND bank_detail_id IS NOT NULL AND crypto_detail_id IS NULL OR method::text = 'binance'::text AND crypto_detail_id IS NOT NULL AND bank_detail_id IS NULL)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.withdrawals
    OWNER to postgres;
-- Index: idx_withdrawals_user_id

-- DROP INDEX IF EXISTS public.idx_withdrawals_user_id;

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id
    ON public.withdrawals USING btree
    (user_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- Trigger: withdrawal_completed_trigger

-- DROP TRIGGER IF EXISTS withdrawal_completed_trigger ON public.withdrawals;

CREATE OR REPLACE TRIGGER withdrawal_completed_trigger
    AFTER INSERT OR UPDATE 
    ON public.withdrawals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_balance_after_withdrawal();
---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_user_balance_for_bet()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
DECLARE
    user_balance DECIMAL(15, 2);
BEGIN
    SELECT balance INTO user_balance FROM users WHERE id = NEW.user_id;
    
    IF user_balance < NEW.stake_amount THEN
        RAISE EXCEPTION 'Insufficient balance to place bet';
    END IF;
    
    -- Deduct the stake amount from the user's balance
    UPDATE users SET balance = balance - NEW.stake_amount WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.update_user_balance_after_bet_settlement()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF NEW.status = 'won' AND OLD.status = 'pending' THEN
        UPDATE users SET balance = balance + NEW.potential_payout WHERE id = NEW.user_id;
    ELSIF NEW.status = 'canceled' AND OLD.status = 'pending' THEN
        UPDATE users SET balance = balance + NEW.stake_amount WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.update_user_balance_after_deposit()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        UPDATE users SET balance = balance + NEW.amount WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.update_user_balance_after_withdrawal()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        UPDATE users SET balance = balance - NEW.amount WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$BODY$;
-----------------------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.active_tickets_view
 AS
 SELECT t.id,
    u.username,
    t.stake_amount,
    t.total_odds,
    t.potential_payout,
    t.status,
    t.created_at,
    count(ti.id) AS number_of_selections
   FROM tickets t
     JOIN users u ON t.user_id = u.id
     JOIN ticket_items ti ON t.id = ti.ticket_id
  WHERE t.status::text = 'pending'::text
  GROUP BY t.id, u.username, t.stake_amount, t.total_odds, t.potential_payout, t.status, t.created_at
  ORDER BY t.created_at DESC;

  CREATE OR REPLACE VIEW public.active_users_view
 AS
 SELECT id,
    username,
    first_name,
    last_name,
    email,
    phone,
    country,
    balance,
    created_at
   FROM users
  WHERE role::text = 'user'::text
  ORDER BY balance DESC;

  CREATE OR REPLACE VIEW public.pending_deposits_view
 AS
 SELECT d.id,
    u.username,
    d.amount,
    d.method,
    d.reference_number,
    d.transaction_hash,
    d.deposit_date,
    d.created_at
   FROM deposits d
     JOIN users u ON d.user_id = u.id
  WHERE d.status::text = 'pending'::text
  ORDER BY d.created_at;

  CREATE OR REPLACE VIEW public.pending_withdrawals_view
 AS
 SELECT w.id,
    u.username,
    w.amount,
    w.method,
    w.created_at,
        CASE
            WHEN w.method::text = 'mobile_payment'::text THEN (bd.bank_name::text || ' - '::text) || bd.account_number::text
            WHEN w.method::text = 'binance'::text THEN ((cd.wallet_address::text || ' ('::text) || cd.network::text) || ')'::text
            ELSE NULL::text
        END AS destination_details
   FROM withdrawals w
     JOIN users u ON w.user_id = u.id
     LEFT JOIN bank_details bd ON w.bank_detail_id = bd.id
     LEFT JOIN crypto_details cd ON w.crypto_detail_id = cd.id
  WHERE w.status::text = 'pending'::text
  ORDER BY w.created_at;

  CREATE OR REPLACE VIEW public.upcoming_events_view
 AS
 SELECT e.id,
    s.name AS sport,
    c.name AS competition,
    e.home_team,
    e.away_team,
    e.commence_time,
    count(DISTINCT o.id) AS number_of_odds
   FROM events e
     JOIN competitions c ON e.competition_id = c.id
     JOIN sports s ON c.sport_id = s.id
     LEFT JOIN odds o ON e.id = o.event_id
  WHERE e.status::text = 'upcoming'::text AND e.commence_time > now()
  GROUP BY e.id, s.name, c.name, e.home_team, e.away_team, e.commence_time
  ORDER BY e.commence_time;

ALTER TABLE public.upcoming_events_view
    OWNER TO postgres;