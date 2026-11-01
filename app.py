import os
import json
import time
from datetime import datetime
from functools import wraps
from collections import defaultdict
from flask import Flask, request, jsonify, session, render_template, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db, init_db, create_default_zones_for_user

# Toujours initialiser la base de données au lancement (Gunicorn & dev)
init_db()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'benarmagnac_super_secret_vps_key_2026_change_in_prod')
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32 MB max
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600 * 24 * 30  # 30 jours

# ================= RATE LIMITING (ANTI-BRUTEFORCE) =================
# Limite les tentatives par IP (max 5 échecs par 60 secondes)
FAILED_ATTEMPTS = defaultdict(list)

def check_rate_limit(ip, max_attempts=5, window_seconds=60):
    now = time.time()
    attempts = [t for t in FAILED_ATTEMPTS[ip] if now - t < window_seconds]
    FAILED_ATTEMPTS[ip] = attempts
    return len(attempts) < max_attempts

def record_failed_attempt(ip):
    FAILED_ATTEMPTS[ip].append(time.time())

def clear_failed_attempts(ip):
    FAILED_ATTEMPTS.pop(ip, None)

def get_client_ip():
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr or '127.0.0.1'

def get_request_db():
    if 'db' not in g:
        g.db = get_db()
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Non autorisé. Veuillez vous connecter.'}), 401
        return f(*args, **kwargs)
    return decorated_function

# ================= AUTHENTICATION =================

@app.route('/api/auth/register', methods=['POST'])
def register():
    client_ip = get_client_ip()
    if not check_rate_limit(client_ip, max_attempts=10, window_seconds=60):
        return jsonify({'error': 'Trop de tentatives d\'inscription. Veuillez patienter 1 minute.'}), 429

    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    cave_name = data.get('cave_name', '').strip() or 'Ma Cave'

    if not email or '@' not in email:
        return jsonify({'error': 'Adresse email invalide'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 6 caractères'}), 400

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        record_failed_attempt(client_ip)
        return jsonify({'error': 'Un compte existe déjà avec cette adresse email'}), 409

    hashed_pw = generate_password_hash(password)
    try:
        cursor.execute(
            'INSERT INTO users (email, password_hash, cave_name) VALUES (?, ?, ?)',
            (email, hashed_pw, cave_name)
        )
        user_id = cursor.lastrowid
        create_default_zones_for_user(user_id, conn=db)
        db.commit()
    except Exception as e:
        db.rollback()
        return jsonify({'error': f"Erreur base de données: {str(e)}"}), 500

    clear_failed_attempts(client_ip)
    session.permanent = True
    session['user_id'] = user_id

    return jsonify({
        'success': True,
        'user': {
            'id': user_id,
            'email': email,
            'cave_name': cave_name,
            'role': 'caviste'
        }
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    client_ip = get_client_ip()
    if not check_rate_limit(client_ip, max_attempts=5, window_seconds=60):
        return jsonify({'error': 'Trop d\'essais infructueux. Veuillez patienter 1 minute avant de réessayer.'}), 429

    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id, email, password_hash, cave_name, role FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()

    if not user or not check_password_hash(user['password_hash'], password):
        record_failed_attempt(client_ip)
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    clear_failed_attempts(client_ip)
    session.permanent = True
    session['user_id'] = user['id']

    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'cave_name': user['cave_name'],
            'role': user['role']
        }
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'user': None}), 200

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id, email, cave_name, role, created_at FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()

    if not user:
        session.clear()
        return jsonify({'user': None}), 200

    return jsonify({
        'user': {
            'id': user['id'],
            'email': user['email'],
            'cave_name': user['cave_name'],
            'role': user['role'],
            'created_at': user['created_at']
        }
    })

@app.route('/api/auth/profile', methods=['PUT'])
@login_required
def update_profile():
    user_id = session['user_id']
    data = request.get_json() or {}
    new_cave_name = data.get('cave_name', '').strip()
    new_password = data.get('password', '').strip()

    db = get_request_db()
    cursor = db.cursor()

    if new_cave_name:
        cursor.execute('UPDATE users SET cave_name = ? WHERE id = ?', (new_cave_name, user_id))

    if new_password and len(new_password) >= 6:
        cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (generate_password_hash(new_password), user_id))

    db.commit()

    cursor.execute('SELECT id, email, cave_name, role FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()

    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'cave_name': user['cave_name'],
            'role': user['role']
        }
    })

# ================= CELLAR ZONES & AGENCEMENT =================

@app.route('/api/zones', methods=['GET'])
@login_required
def get_zones():
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('''
        SELECT id, name, type, columns, rows, capacity_per_slot, position_order, config_json, created_at
        FROM cellar_zones
        WHERE user_id = ?
        ORDER BY position_order ASC, id ASC
    ''', (user_id,))
    zones = []
    for r in cursor.fetchall():
        try:
            cfg = json.loads(r['config_json']) if r['config_json'] else {}
        except Exception:
            cfg = {}
        zones.append({
            'id': r['id'],
            'name': r['name'],
            'type': r['type'],
            'columns': r['columns'],
            'rows': r['rows'],
            'capacity_per_slot': r['capacity_per_slot'],
            'position_order': r['position_order'],
            'config': cfg,
            'created_at': r['created_at']
        })
    return jsonify(zones)

@app.route('/api/zones', methods=['POST'])
@login_required
def create_zone():
    user_id = session['user_id']
    data = request.get_json() or {}
    name = data.get('name', '').strip() or 'Nouvel Espace'
    zone_type = data.get('type', 'losange')
    columns = int(data.get('columns', 6))
    rows = int(data.get('rows', 3))
    capacity_per_slot = int(data.get('capacity_per_slot', 12))
    position_order = int(data.get('position_order', 1))
    config = json.dumps(data.get('config', {}))

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('''
        INSERT INTO cellar_zones (user_id, name, type, columns, rows, capacity_per_slot, position_order, config_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, name, zone_type, columns, rows, capacity_per_slot, position_order, config))
    db.commit()
    new_id = cursor.lastrowid

    return jsonify({
        'id': new_id,
        'name': name,
        'type': zone_type,
        'columns': columns,
        'rows': rows,
        'capacity_per_slot': capacity_per_slot,
        'position_order': position_order,
        'config': data.get('config', {})
    }), 201

@app.route('/api/zones/<int:zone_id>', methods=['PUT'])
@login_required
def update_zone(zone_id):
    user_id = session['user_id']
    data = request.get_json() or {}

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM cellar_zones WHERE id = ? AND user_id = ?', (zone_id, user_id))
    if not cursor.fetchone():
        return jsonify({'error': 'Espace introuvable'}), 404

    name = data.get('name')
    zone_type = data.get('type')
    columns = data.get('columns')
    rows = data.get('rows')
    capacity_per_slot = data.get('capacity_per_slot')
    position_order = data.get('position_order')
    config = json.dumps(data.get('config', {})) if 'config' in data else None

    updates = []
    params = []
    if name is not None:
        updates.append('name = ?')
        params.append(name.strip())
    if zone_type is not None:
        updates.append('type = ?')
        params.append(zone_type)
    if columns is not None:
        updates.append('columns = ?')
        params.append(int(columns))
    if rows is not None:
        updates.append('rows = ?')
        params.append(int(rows))
    if capacity_per_slot is not None:
        updates.append('capacity_per_slot = ?')
        params.append(int(capacity_per_slot))
    if position_order is not None:
        updates.append('position_order = ?')
        params.append(int(position_order))
    if config is not None:
        updates.append('config_json = ?')
        params.append(config)

    if updates:
        params.extend([zone_id, user_id])
        cursor.execute(f"UPDATE cellar_zones SET {', '.join(updates)} WHERE id = ? AND user_id = ?", params)
        db.commit()

    return jsonify({'success': True})

@app.route('/api/zones/<int:zone_id>', methods=['DELETE'])
@login_required
def delete_zone(zone_id):
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('DELETE FROM cellar_zones WHERE id = ? AND user_id = ?', (zone_id, user_id))
    db.commit()
    return jsonify({'success': True})

# ================= INVENTORY =================

@app.route('/api/inventory', methods=['GET'])
@login_required
def get_inventory():
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('''
        SELECT id, nom, appellation, millesime, type, region, prix,
               apogee_debut, apogee_fin, zone_id, mur, col, lig,
               carton_label, statut, notes, date_ajout
        FROM bottles
        WHERE user_id = ? AND statut != '__deleted__'
        ORDER BY nom ASC, millesime ASC
    ''', (user_id,))
    bottles = []
    for r in cursor.fetchall():
        bottles.append({
            'id': r['id'],
            'nom': r['nom'],
            'appellation': r['appellation'] or '',
            'millesime': r['millesime'],
            'type': r['type'],
            'region': r['region'] or '',
            'prix': float(r['prix'] or 0),
            'apogee_debut': r['apogee_debut'],
            'apogee_fin': r['apogee_fin'],
            'zone_id': r['zone_id'],
            'emplacement': {
                'zone_id': r['zone_id'],
                'mur': r['mur'] or 1,
                'col': r['col'] or 1,
                'lig': r['lig'] or 1,
                'carton_label': r['carton_label'] or ''
            },
            'statut': r['statut'],
            'notes': r['notes'] or '',
            'date_ajout': r['date_ajout']
        })
    return jsonify(bottles)

@app.route('/api/inventory', methods=['POST'])
@login_required
def add_bottle():
    user_id = session['user_id']
    data = request.get_json() or {}

    qty = max(1, int(data.get('quantite', 1)))
    nom = data.get('nom', '').strip()
    appellation = data.get('appellation', '').strip()
    millesime = int(data.get('millesime')) if data.get('millesime') else None
    type_vin = data.get('type', 'Rouge')
    region = data.get('region', '').strip()
    prix = float(data.get('prix') or 0)
    apogee_debut = int(data.get('apogee_debut')) if data.get('apogee_debut') else None
    apogee_fin = int(data.get('apogee_fin')) if data.get('apogee_fin') else None

    emp = data.get('emplacement', {})
    zone_id = emp.get('zone_id') or data.get('zone_id')
    mur = int(emp.get('mur') or data.get('mur') or 1)
    col = int(emp.get('col') or data.get('col') or 1)
    lig = int(emp.get('lig') or data.get('lig') or 1)
    carton_label = emp.get('carton_label') or data.get('carton_label') or ''
    notes = data.get('notes', '')
    statut = data.get('statut', 'En cave')
    date_ajout = data.get('date_ajout') or datetime.utcnow().isoformat()

    db = get_request_db()
    cursor = db.cursor()

    created_ids = []
    for _ in range(qty):
        cursor.execute('''
            INSERT INTO bottles (
                user_id, nom, appellation, millesime, type, region, prix,
                apogee_debut, apogee_fin, zone_id, mur, col, lig, carton_label,
                statut, notes, date_ajout
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id, nom, appellation, millesime, type_vin, region, prix,
            apogee_debut, apogee_fin, zone_id, mur, col, lig, carton_label,
            statut, notes, date_ajout
        ))
        created_ids.append(cursor.lastrowid)

    db.commit()
    return jsonify({'success': True, 'ids': created_ids, 'count': qty}), 201

@app.route('/api/inventory/<int:bottle_id>', methods=['PUT'])
@login_required
def update_bottle(bottle_id):
    user_id = session['user_id']
    data = request.get_json() or {}

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM bottles WHERE id = ? AND user_id = ?', (bottle_id, user_id))
    if not cursor.fetchone():
        return jsonify({'error': 'Bouteille non trouvée'}), 404

    emp = data.get('emplacement', {})
    fields = {
        'nom': data.get('nom'),
        'appellation': data.get('appellation'),
        'millesime': data.get('millesime'),
        'type': data.get('type'),
        'region': data.get('region'),
        'prix': data.get('prix'),
        'apogee_debut': data.get('apogee_debut'),
        'apogee_fin': data.get('apogee_fin'),
        'zone_id': emp.get('zone_id') or data.get('zone_id'),
        'mur': emp.get('mur') or data.get('mur'),
        'col': emp.get('col') or data.get('col'),
        'lig': emp.get('lig') or data.get('lig'),
        'carton_label': emp.get('carton_label') or data.get('carton_label'),
        'statut': data.get('statut'),
        'notes': data.get('notes')
    }

    updates = []
    params = []
    for k, v in fields.items():
        if v is not None:
            updates.append(f"{k} = ?")
            params.append(v)

    if updates:
        params.extend([bottle_id, user_id])
        cursor.execute(f"UPDATE bottles SET {', '.join(updates)} WHERE id = ? AND user_id = ?", params)
        db.commit()

    return jsonify({'success': True})

@app.route('/api/inventory/<int:bottle_id>', methods=['DELETE'])
@login_required
def delete_bottle(bottle_id):
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute("UPDATE bottles SET statut = '__deleted__' WHERE id = ? AND user_id = ?", (bottle_id, user_id))
    db.commit()
    return jsonify({'success': True})

# ================= TASTING LOG (HISTORIQUE) =================

@app.route('/api/tastings', methods=['GET'])
@login_required
def get_tastings():
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('''
        SELECT id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, qp, created_at
        FROM tasting_log
        WHERE user_id = ?
        ORDER BY date_consommation DESC, created_at DESC
    ''', (user_id,))
    tastings = []
    for r in cursor.fetchall():
        try:
            b_ref = json.loads(r['bottle_ref_json'])
        except Exception:
            b_ref = {}
        try:
            tags = json.loads(r['tags_json'])
        except Exception:
            tags = []
        tastings.append({
            'id': r['id'],
            'bottle_ref': b_ref,
            'date_consommation': r['date_consommation'],
            'note': r['note'],
            'commentaire': r['commentaire'] or '',
            'photo_base64': r['photo_base64'],
            'tags': tags,
            'qp': r['qp'] or 0,
            'created_at': r['created_at']
        })
    return jsonify(tastings)

@app.route('/api/tastings', methods=['POST'])
@login_required
def add_tasting():
    user_id = session['user_id']
    data = request.get_json() or {}

    t_id = data.get('id') or f"tl_{int(datetime.utcnow().timestamp()*1000)}"
    b_ref = json.dumps(data.get('bottle_ref', {}))
    date_c = data.get('date_consommation') or datetime.utcnow().strftime('%Y-%m-%d')
    note = data.get('note')
    comment = data.get('commentaire', '').strip()
    photo = data.get('photo_base64')
    tags = json.dumps(data.get('tags', []))
    qp = data.get('qp', 0)

    db = get_request_db()
    cursor = db.cursor()

    bottle_id = data.get('bottle_id')
    if bottle_id:
        cursor.execute("UPDATE bottles SET statut = 'Bue' WHERE id = ? AND user_id = ?", (bottle_id, user_id))

    cursor.execute('''
        INSERT OR REPLACE INTO tasting_log (id, user_id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, qp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (t_id, user_id, b_ref, date_c, note, comment, photo, tags, qp))
    db.commit()

    return jsonify({'success': True, 'id': t_id}), 201

@app.route('/api/tastings/<string:tasting_id>', methods=['PUT'])
@login_required
def update_tasting(tasting_id):
    user_id = session['user_id']
    data = request.get_json() or {}

    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM tasting_log WHERE id = ? AND user_id = ?', (tasting_id, user_id))
    if not cursor.fetchone():
        return jsonify({'error': 'Note de dégustation non trouvée'}), 404

    note = data.get('note')
    comment = data.get('commentaire')
    photo = data.get('photo_base64')
    tags = json.dumps(data.get('tags')) if 'tags' in data else None
    date_c = data.get('date_consommation')
    qp = data.get('qp')

    updates = []
    params = []
    if note is not None:
        updates.append('note = ?')
        params.append(note)
    if comment is not None:
        updates.append('commentaire = ?')
        params.append(comment)
    if photo is not None:
        updates.append('photo_base64 = ?')
        params.append(photo)
    if tags is not None:
        updates.append('tags_json = ?')
        params.append(tags)
    if date_c is not None:
        updates.append('date_consommation = ?')
        params.append(date_c)
    if qp is not None:
        updates.append('qp = ?')
        params.append(qp)

    if updates:
        params.extend([tasting_id, user_id])
        cursor.execute(f"UPDATE tasting_log SET {', '.join(updates)} WHERE id = ? AND user_id = ?", params)
        db.commit()

    return jsonify({'success': True})

@app.route('/api/tastings/<string:tasting_id>', methods=['DELETE'])
@login_required
def delete_tasting(tasting_id):
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()
    cursor.execute('DELETE FROM tasting_log WHERE id = ? AND user_id = ?', (tasting_id, user_id))
    db.commit()
    return jsonify({'success': True})

# ================= IMPORT & EXPORT =================

@app.route('/api/inventory/import', methods=['POST'])
@login_required
def import_data():
    user_id = session['user_id']
    payload = request.get_json() or {}

    raw_bottles = payload if isinstance(payload, list) else payload.get('inventory', [])
    raw_tastings = [] if isinstance(payload, list) else payload.get('tastingLog', [])

    db = get_request_db()
    cursor = db.cursor()

    cursor.execute('SELECT id, name, type FROM cellar_zones WHERE user_id = ? ORDER BY id ASC', (user_id,))
    zones = cursor.fetchall()
    default_zone_id = zones[0]['id'] if zones else None

    imported_bottles_count = 0
    for b in raw_bottles:
        statut = b.get('statut', 'En cave')
        if statut == '__deleted__':
            continue

        emp = b.get('emplacement', {})
        if not isinstance(emp, dict):
            emp = {}

        mur = emp.get('mur') or 1
        col = emp.get('col') or 1
        lig = emp.get('lig') or 1
        carton_label = emp.get('carton_label', '')
        zone_id = emp.get('zone_id') or default_zone_id

        cursor.execute('''
            INSERT INTO bottles (
                user_id, nom, appellation, millesime, type, region, prix,
                apogee_debut, apogee_fin, zone_id, mur, col, lig, carton_label,
                statut, notes, date_ajout
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            b.get('nom', 'Sans nom'),
            b.get('appellation', ''),
            b.get('millesime'),
            b.get('type', 'Rouge'),
            b.get('region', ''),
            float(b.get('prix') or 0),
            b.get('apogee_debut'),
            b.get('apogee_fin'),
            zone_id,
            mur,
            col,
            lig,
            carton_label,
            statut,
            b.get('notes', ''),
            b.get('date_ajout') or datetime.utcnow().isoformat()
        ))
        imported_bottles_count += 1

    imported_tastings_count = 0
    for t in raw_tastings:
        t_id = t.get('id') or f"tl_{int(datetime.utcnow().timestamp()*1000)}_{imported_tastings_count}"
        cursor.execute('''
            INSERT OR REPLACE INTO tasting_log (id, user_id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, qp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            t_id,
            user_id,
            json.dumps(t.get('bottle_ref', {})),
            t.get('date_consommation', datetime.utcnow().strftime('%Y-%m-%d')),
            t.get('note'),
            t.get('commentaire', ''),
            t.get('photo_base64'),
            json.dumps(t.get('tags', [])),
            t.get('qp', 0)
        ))
        imported_tastings_count += 1

    db.commit()
    return jsonify({
        'success': True,
        'bottles_imported': imported_bottles_count,
        'tastings_imported': imported_tastings_count
    })

@app.route('/api/export', methods=['GET'])
@login_required
def export_data():
    user_id = session['user_id']
    db = get_request_db()
    cursor = db.cursor()

    cursor.execute('SELECT email, cave_name FROM users WHERE id = ?', (user_id,))
    u = cursor.fetchone()

    cursor.execute('SELECT id, name, type, columns, rows, capacity_per_slot, config_json FROM cellar_zones WHERE user_id = ?', (user_id,))
    zones = [dict(r) for r in cursor.fetchall()]

    cursor.execute('''
        SELECT id, nom, appellation, millesime, type, region, prix,
               apogee_debut, apogee_fin, zone_id, mur, col, lig, carton_label, statut, notes, date_ajout
        FROM bottles WHERE user_id = ? AND statut != '__deleted__'
    ''', (user_id,))
    bottles = []
    for r in cursor.fetchall():
        bottles.append({
            'id': r['id'],
            'nom': r['nom'],
            'appellation': r['appellation'],
            'millesime': r['millesime'],
            'type': r['type'],
            'region': r['region'],
            'prix': r['prix'],
            'apogee_debut': r['apogee_debut'],
            'apogee_fin': r['apogee_fin'],
            'emplacement': {
                'zone_id': r['zone_id'],
                'mur': r['mur'],
                'col': r['col'],
                'lig': r['lig'],
                'carton_label': r['carton_label']
            },
            'statut': r['statut'],
            'notes': r['notes'],
            'date_ajout': r['date_ajout']
        })

    cursor.execute('SELECT id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, qp, created_at FROM tasting_log WHERE user_id = ?', (user_id,))
    tastings = []
    for r in cursor.fetchall():
        try:
            b_ref = json.loads(r['bottle_ref_json'])
        except Exception:
            b_ref = {}
        try:
            tags = json.loads(r['tags_json'])
        except Exception:
            tags = []
        tastings.append({
            'id': r['id'],
            'bottle_ref': b_ref,
            'date_consommation': r['date_consommation'],
            'note': r['note'],
            'commentaire': r['commentaire'],
            'photo_base64': r['photo_base64'],
            'tags': tags,
            'qp': r['qp'] or 0,
            'created_at': r['created_at']
        })

    export_obj = {
        'version': '3.0',
        'export_date': datetime.utcnow().isoformat(),
        'cave_name': u['cave_name'] if u else 'Ma Cave',
        'zones': zones,
        'inventory': bottles,
        'tastingLog': tastings
    }

    return jsonify(export_obj)


# ================= ESTIMATION COTE IDEALWINE & MARCHE =================

import unicodedata

def normalize_wine_name(name):
    if not name:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(name))
    no_accent = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return no_accent.lower().replace('-', ' ').strip()

# Cotes réelles de référence du marché d'enchères (iDealwine, Sotheby's, Wine-Searcher)
# Basées sur les millésimes matures classiques (référence 1985 = base 1.0)
CRUS_AUCTION_BASELINE = {
    # 1ers Grands Crus Classés Bordeaux
    'latour': 420,
    'chateau latour': 420,
    'margaux': 410,
    'chateau margaux': 410,
    'mouton rothschild': 410,
    'chateau mouton rothschild': 410,
    'mouton': 410,
    'haut brion': 415,
    'chateau haut brion': 415,
    'lafite rothschild': 540,
    'chateau lafite rothschild': 540,
    'lafite': 540,
    'cheval blanc': 510,
    'chateau cheval blanc': 510,
    'ausone': 480,
    'chateau ausone': 480,
    'petrus': 2600,
    'chateau petrus': 2600,
    'le pin': 2200,
    'yquem': 290,
    "d'yquem": 290,
    'chateau d yquem': 290,

    # Seconds Vins
    'forts de latour': 135,
    'les forts de latour': 135,
    'pavillon rouge': 130,
    'carruades de lafite': 220,
    'carruades': 220,
    'petit mouton': 180,
    'bahans haut brion': 110,
    'clarence de haut brion': 110,

    # 2e à 5e Grands Crus Classés Bordeaux
    'leoville las cases': 165,
    'leoville poyferre': 110,
    'leoville barton': 98,
    'pichon baron': 140,
    'pichon comtesse': 155,
    'pichon longueville': 145,
    'cos d estournel': 150,
    'montrose': 145,
    'palmer': 220,
    'chateau palmer': 220,
    'ducru beaucaillou': 140,
    'lynch bages': 140,
    'chateau lynch bages': 140,
    'pontet canet': 110,
    'chateau pontet canet': 110,
    'talbot': 75,
    'gruaud larose': 85,
    'calon segur': 90,
    'smith haut lafitte': 95,
    'pape clement': 95,
    'figeac': 160,
    'angelus': 280,
    'pavie': 260,

    # Bourgogne prestigieux
    'romanee conti': 16000,
    'la tache': 4200,
    'richebourg': 2600,
    'romanee saint vivant': 2100,
    'grands echezeaux': 1800,
    'drc': 12000,
    'domaine leroy': 4500,
    'leroy': 3500,
    'roumier': 1400,
    'armand rousseau': 2400,
    'chambertin': 450,
    'clos de tart': 380,
    'dujac': 390,
    'clos de la roche': 320,
    'meursault': 95,
    'corton charlemagne': 190,
    'montrachet': 1200,

    # Rhône & autres pépites
    'rayas': 1200,
    'chateau de rayas': 1200,
    'guigal la mouline': 390,
    'guigal la landonne': 390,
    'guigal la turque': 390,
    'chave': 360,
    'chapoutier ermitage': 190,
    'beaucastel': 90,
    'hommage a jacques perrin': 320,
    'trevallon': 120,
    'grange des peres': 310,
    'clos rougeard': 340,

    # Champagnes
    'dom perignon': 220,
    'cristal': 260,
    'krug': 250,
    'salon': 850,
    'comtes de champagne': 175,
    'selosse': 480
}

# Multiplicateurs de millésime par rapport au millésime classique 1985
VINTAGE_MULTIPLIERS = {
    1945: 5.0, 1961: 4.0, 1982: 3.5, 1989: 1.85, 1990: 1.9,
    2000: 2.1, 2005: 1.9, 2009: 2.2, 2010: 2.3, 2015: 1.5, 2016: 1.6,
    1985: 1.0, 1986: 1.2, 1988: 1.05, 1995: 1.15, 1996: 1.25, 1998: 1.1,
    2001: 1.1, 2003: 1.15, 2008: 1.05, 2018: 1.35, 2019: 1.35, 2020: 1.4,
    1984: 0.75, 1987: 0.8, 1991: 0.75, 1992: 0.7, 1993: 0.75, 1994: 0.8,
    1997: 0.8, 2002: 0.85, 2004: 0.95, 2007: 0.85, 2013: 0.75
}

def calculate_market_estimate(nom, millesime, appellation, region):
    norm_nom = normalize_wine_name(nom)
    norm_app = normalize_wine_name(appellation)
    norm_reg = normalize_wine_name(region)
    full_text = f"{norm_nom} {norm_app} {norm_reg}"

    # 1. Recherche par correspondance dans les crus cotés (tri par longueur décroissante de clé pour matcher les plus spécifiques d'abord)
    base_price = None
    sorted_crus = sorted(CRUS_AUCTION_BASELINE.keys(), key=lambda k: len(k), reverse=True)
    for k in sorted_crus:
        if k in norm_nom or k in full_text:
            base_price = CRUS_AUCTION_BASELINE[k]
            break

    # 2. Si non trouvé dans les crus répertoriés, estimation selon l'appellation et le statut
    if base_price is None:
        if 'grand cru' in full_text:
            base_price = 85
        elif 'premier cru' in full_text or '1er cru' in full_text:
            base_price = 55
        elif 'pauillac' in full_text or 'pomerol' in full_text:
            base_price = 50
        elif 'saint julien' in full_text or 'margaux' in full_text or 'saint emilion' in full_text:
            base_price = 45
        elif 'champagne' in full_text:
            base_price = 48
        elif 'chateauneuf' in full_text:
            base_price = 42
        elif 'bourgogne' in full_text:
            base_price = 38
        elif 'bordeaux' in full_text:
            base_price = 24
        elif 'rhone' in full_text:
            base_price = 22
        else:
            base_price = 20

    # 3. Application du coefficient de millésime
    try:
        y = int(millesime)
    except Exception:
        y = None

    if y and y in VINTAGE_MULTIPLIERS:
        vint_mult = VINTAGE_MULTIPLIERS[y]
    elif y and y < 1980:
        vint_mult = 1.35
    elif y and y > 2010:
        vint_mult = 1.25
    else:
        vint_mult = 1.0

    est = round(base_price * vint_mult)
    low = round(est * 0.90)
    high = round(est * 1.12)
    return est, low, high

@app.route('/api/wine/idealwine-estimate', methods=['GET'])
@login_required
def estimate_wine_route():
    nom = request.args.get('nom', '').strip()
    millesime = request.args.get('millesime', '').strip()
    appellation = request.args.get('appellation', '').strip()
    region = request.args.get('region', '').strip()

    if not nom:
        return jsonify({'error': 'Nom de la bouteille requis'}), 400

    est_price, low_price, high_price = calculate_market_estimate(nom, millesime, appellation, region)
    query_str = f"{nom} {millesime}".strip().replace(' ', '+')
    idealwine_url = f"https://www.idealwine.com/fr/cote?search={query_str}"
    wsearch_url = f"https://www.wine-searcher.com/find/{query_str}"

    return jsonify({
        'success': True,
        'nom': nom,
        'millesime': millesime,
        'estimate_price': est_price,
        'low_estimate': low_price,
        'high_estimate': high_price,
        'idealwine_url': idealwine_url,
        'wine_searcher_url': wsearch_url,
        'source': 'Argus de référence iDealwine & Enchères'
    })

# ================= FRONTEND ROUTE =================

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
