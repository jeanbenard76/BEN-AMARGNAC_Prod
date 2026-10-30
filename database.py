import sqlite3
import os
import json

DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(__file__), 'data', 'cave.db'))

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db()
    with conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            cave_name TEXT NOT NULL,
            role TEXT DEFAULT 'caviste',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cellar_zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            columns INTEGER DEFAULT 6,
            rows INTEGER DEFAULT 3,
            capacity_per_slot INTEGER DEFAULT 24,
            position_order INTEGER DEFAULT 1,
            config_json TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bottles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nom TEXT NOT NULL,
            appellation TEXT DEFAULT '',
            millesime INTEGER,
            type TEXT NOT NULL,
            region TEXT DEFAULT '',
            prix REAL DEFAULT 0,
            apogee_debut INTEGER,
            apogee_fin INTEGER,
            zone_id INTEGER,
            mur INTEGER DEFAULT 1,
            col INTEGER DEFAULT 1,
            lig INTEGER DEFAULT 1,
            carton_label TEXT DEFAULT '',
            statut TEXT DEFAULT 'En cave',
            notes TEXT DEFAULT '',
            date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (zone_id) REFERENCES cellar_zones(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS tasting_log (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            bottle_ref_json TEXT NOT NULL,
            date_consommation TEXT NOT NULL,
            note REAL,
            commentaire TEXT DEFAULT '',
            photo_base64 TEXT,
            tags_json TEXT DEFAULT '[]',
            qp INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_bottles_user_statut ON bottles(user_id, statut);
        CREATE INDEX IF NOT EXISTS idx_bottles_zone ON bottles(zone_id);
        CREATE INDEX IF NOT EXISTS idx_tasting_user ON tasting_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_zones_user ON cellar_zones(user_id);
        ''')
        try:
            conn.execute("ALTER TABLE tasting_log ADD COLUMN qp INTEGER DEFAULT 0;")
        except Exception:
            pass
    conn.close()

def create_default_zones_for_user(user_id, conn=None):
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True

    zones = [
        ("Grande Cave — Casiers Losanges", "losange", 14, 3, 48, 1, json.dumps({"wall": 2, "wood_color": "#3b2010"})),
        ("Étagères Murales Gauche", "etagere", 8, 4, 12, 2, json.dumps({"wall": 1, "shelf_style": "chene"})),
        ("Espace Caisses & Cartons au Sol", "cartons", 6, 3, 12, 3, json.dumps({"nb_cartons": 18, "type_boite": "bois_et_kraft"})),
        ("Armoire Réfrigérée EuroCave", "armoire", 2, 6, 12, 4, json.dumps({"clayettes": 6, "temp": 12}))
    ]
    conn.executemany('''
        INSERT INTO cellar_zones (user_id, name, type, columns, rows, capacity_per_slot, position_order, config_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', [(user_id, z[0], z[1], z[2], z[3], z[4], z[5], z[6]) for z in zones])

    if should_close:
        conn.commit()
        conn.close()
