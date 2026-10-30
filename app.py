import os
import json
import sqlite3
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db, init_db, create_default_zones_for_user

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'benarmagnac_super_secret_vps_key_2026_change_in_prod')
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32 MB max for photo uploads
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 3600 * 24 * 30  # 30 jours

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
        return jsonify({'error': 'Un compte existe déjà avec cette adresse email'}), 409

    hashed_pw = generate_password_hash(password)
    cursor.execute(
        'INSERT INTO users (email, password_hash, cave_name) VALUES (?, ?, ?)',
        (email, hashed_pw, cave_name)
    )
    user_id = cursor.lastrowid
    db.commit()

    # Create default cellar layout & storage zones
    create_default_zones_for_user(user_id)

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
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

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
            'type': r['type'], # 'losange', 'etagere', 'cartons', 'armoire'
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

    # Emplacement
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
        SELECT id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, created_at
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

    db = get_request_db()
    cursor = db.cursor()

    # If bottle_id provided, mark that bottle as 'Bue'
    bottle_id = data.get('bottle_id')
    if bottle_id:
        cursor.execute("UPDATE bottles SET statut = 'Bue' WHERE id = ? AND user_id = ?", (bottle_id, user_id))

    cursor.execute('''
        INSERT OR REPLACE INTO tasting_log (id, user_id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (t_id, user_id, b_ref, date_c, note, comment, photo, tags))
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

    # Supports either raw array of bottles OR { inventory: [...], tastingLog: [...] }
    raw_bottles = payload if isinstance(payload, list) else payload.get('inventory', [])
    raw_tastings = [] if isinstance(payload, list) else payload.get('tastingLog', [])

    db = get_request_db()
    cursor = db.cursor()

    # Find user zones to map legacy mur 1/2/3
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
            INSERT OR REPLACE INTO tasting_log (id, user_id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            t_id,
            user_id,
            json.dumps(t.get('bottle_ref', {})),
            t.get('date_consommation', datetime.utcnow().strftime('%Y-%m-%d')),
            t.get('note'),
            t.get('commentaire', ''),
            t.get('photo_base64'),
            json.dumps(t.get('tags', []))
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

    # User info
    cursor.execute('SELECT email, cave_name FROM users WHERE id = ?', (user_id,))
    u = cursor.fetchone()

    # Zones
    cursor.execute('SELECT id, name, type, columns, rows, capacity_per_slot, config_json FROM cellar_zones WHERE user_id = ?', (user_id,))
    zones = [dict(r) for r in cursor.fetchall()]

    # Bottles
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

    # Tastings
    cursor.execute('SELECT id, bottle_ref_json, date_consommation, note, commentaire, photo_base64, tags_json, created_at FROM tasting_log WHERE user_id = ?', (user_id,))
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

# ================= FRONTEND ROUTE =================

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

