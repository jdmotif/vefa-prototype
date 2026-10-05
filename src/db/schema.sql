PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS programmes (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  city         TEXT NOT NULL,
  postal_code  TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  highlights   TEXT NOT NULL DEFAULT '',  -- un atout par ligne
  delivery     TEXT NOT NULL DEFAULT '',  -- ex. « 2e trimestre 2027 »
  hero_image   TEXT,
  status       TEXT NOT NULL DEFAULT 'publie' CHECK (status IN ('brouillon','publie','archive')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS programme_images (
  id           INTEGER PRIMARY KEY,
  programme_id INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  alt          TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lots (
  id              INTEGER PRIMARY KEY,
  programme_id    INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  reference       TEXT NOT NULL,
  building        TEXT NOT NULL DEFAULT '',
  floor           INTEGER NOT NULL DEFAULT 0,       -- 0 = rez-de-chaussée
  typology        TEXT NOT NULL CHECK (typology IN ('T1','T2','T3','T4','T5','Maison')),
  surface         REAL NOT NULL,                    -- m² habitables
  outdoor_type    TEXT NOT NULL DEFAULT 'aucun' CHECK (outdoor_type IN ('aucun','balcon','terrasse','jardin')),
  outdoor_surface REAL,
  orientation     TEXT NOT NULL DEFAULT '',
  parking         INTEGER NOT NULL DEFAULT 0,       -- nombre de places
  price           INTEGER NOT NULL,                 -- prix TTC en euros
  status          TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible','reserve','vendu')),
  plan_image      TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (programme_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_lots_programme ON lots(programme_id);

CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  programme_id  INTEGER REFERENCES programmes(id) ON DELETE SET NULL,
  lot_id        INTEGER REFERENCES lots(id) ON DELETE SET NULL,
  lot_reference TEXT NOT NULL DEFAULT '',          -- copie, au cas où le lot serait supprimé
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  project       TEXT NOT NULL CHECK (project IN ('habiter','investir')),
  budget        INTEGER,
  message       TEXT NOT NULL DEFAULT '',
  consent_at    TEXT NOT NULL,
  consent_text  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','contacte','rdv','perdu','vendu')),
  notes         TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_previews (
  token        TEXT PRIMARY KEY,
  programme_id INTEGER NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  token      TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
