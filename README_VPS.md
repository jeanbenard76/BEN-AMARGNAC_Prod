# 🍷 BEN'ARMAGNAC — Guide de Déploiement VPS & Multi-Utilisateurs

Ce guide vous accompagne pas à pas pour déployer votre application **BEN'ARMAGNAC** sur votre **VPS** (OVH, Hetzner, Scaleway, DigitalOcean, Linode, AWS...), activer le multi-utilisateurs, sécuriser l'accès avec un nom de domaine et un certificat SSL HTTPS gratuit.

---

## 📋 Nouveautés de cette Version 3.0

1. **Multi-Utilisateurs avec Isolation Totale** :
   - Inscription et connexion sécurisées (mots de passe hachés, sessions protégées).
   - Chaque utilisateur choisit son **nom de caviste** (ex: *« Cave de Benjamin »*, *« Le Chai de Julien »*).
   - Les caves, bouteilles, dégustations et agencements sont entièrement cloisonnés par utilisateur.

2. **Personnalisation Complète des Moyens de Conservation (Agencement)** :
   - Les utilisateurs choisissent librement comment ils conservent leur vin :
     - 📦 **Sur des cartons ou caisses** (posés au sol ou sur palettes, choix du nombre de piles, hauteur, capacité).
     - 🪵 **Dans une cave traditionnelle à casiers en losange** (colonnes × lignes paramétrables).
     - 🚪 **Sur des étagères droites** (nombre de niveaux et colonnes).
     - ❄️ **Dans une armoire à vin vitrée / réfrigérée** (clayettes coulissantes).
   - Lors de l'ajout d'une bouteille, l'emplacement s'adapte automatiquement (numéro de carton, numéro de clayette ou ligne/colonne).

3. **Visite Virtuelle 3D Dynamique** :
   - Le moteur 3D (Three.js) lit l'agencement exact configuré par l'utilisateur et génère la pièce en temps réel !
   - Les cartons de vin sont modélisés en 3D avec textures kraft/bois et étiquettes.
   - Les casiers losanges, étagères et armoires vitrées sont fidèlement reproduits.
   - **Clic interactif sur n'importe quel carton, casier ou clayette** pour afficher instantanément les bouteilles rangées à cet endroit.

4. **Performance & Concurrence Élevée** :
   - Base de données **SQLite en mode WAL (Write-Ahead Logging)** : supporte de nombreux utilisateurs simultanés sans aucun verrouillage ni ralentissement.
   - Sauvegardes JSON et CSV toujours disponibles en 1 clic.
   - Importation immédiate de vos fichiers de sauvegarde existants (`cave_backup_*.json` du dossier `Cave_Papa`).

---

## 🚀 Méthode 1 : Déploiement avec Docker (Recommandé, le plus rapide)

Docker garantit que l'application s'exécute exactement de la même manière sur votre VPS que sur votre machine, sans conflit de dépendances.

### 1. Prérequis sur le VPS
Connectez-vous à votre VPS en SSH :
```bash
ssh root@votre-ip-vps
```

Installez Docker et Docker Compose (si ce n'est pas déjà fait) :
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
apt-get install -y docker-compose-plugin
```

### 2. Transférer les fichiers sur le VPS
Depuis votre ordinateur local, copiez le dossier du projet vers votre VPS :
```bash
scp -r "c:\Users\jbenard1\Desktop\99-Perso\01-Projets personnels\06-Gestion Cave\Ben'armagnac_prod" root@votre-ip-vps:/opt/benarmagnac
```
*(ou utilisez FileZilla / WinSCP si vous préférez une interface graphique)*.

### 3. Configurer et Lancer
Sur votre VPS :
```bash
cd /opt/benarmagnac

# Copier l'environnement exemple
cp .env.example .env

# Générer une clé secrète aléatoire
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))" >> .env

# Lancer l'application en arrière-plan
docker compose up -d --build
```

L'application tourne immédiatement sur le port **5000** !

Pour vérifier que tout fonctionne :
```bash
docker compose ps
docker compose logs -f
```

---

## 🛠️ Méthode 2 : Déploiement Natif (Python + Systemd + Gunicorn)

Si vous ne souhaitez pas utiliser Docker, vous pouvez faire tourner l'application nativement :

### 1. Installation des paquets système sur le VPS
```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-venv git nginx
```

### 2. Installation de l'application
```bash
sudo mkdir -p /var/www/benarmagnac
# Copiez vos fichiers dans /var/www/benarmagnac

cd /var/www/benarmagnac
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Activer le service systemd
Copiez le fichier de service fourni :
```bash
sudo cp deploy/benarmagnac.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable benarmagnac
sudo systemctl start benarmagnac
```

Vérifiez le statut :
```bash
sudo systemctl status benarmagnac
```

---

## 🔒 Configuration du Nom de Domaine & HTTPS Gratuit (Let's Encrypt)

Pour que vos utilisateurs accèdent au site via `https://cave.votre-domaine.fr` :

### 1. Pointer votre nom de domaine
Chez votre registrar (OVH, Gandi, Cloudflare, Namecheap...) :
- Ajoutez un enregistrement **DNS A** pointant vers l'adresse IP de votre VPS.

### 2. Configurer Nginx
Sur votre VPS :
```bash
# Copier la configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/benarmagnac

# Modifiez le nom de domaine dans le fichier :
sudo nano /etc/nginx/sites-available/benarmagnac
# Remplacez "votre-domaine.com" par votre vrai domaine

# Activer le site
sudo ln -s /etc/nginx/sites-available/benarmagnac /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. Générer le certificat SSL gratuit (HTTPS)
Installez Certbot :
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com
```
Certbot va configurer le HTTPS automatiquement et programmer son renouvellement tous les 90 jours !

---

## 💾 Sauvegarde Automatique Quotidienne de la Base de Données

Pour ne jamais perdre votre cave, programmez une sauvegarde automatique tous les soirs à 3h du matin :

Ouvrez le crontab sur le VPS :
```bash
crontab -e
```

Ajoutez la ligne suivante :
```bash
0 3 * * * cp /opt/benarmagnac/data/cave.db /opt/benarmagnac/data/cave_backup_$(date +\%F).db
```

---

## 🍷 Comment Importer vos Données Existantes (Cave_Papa) ?

1. Rendez-vous sur votre site `https://votre-domaine.com`.
2. Cliquez sur **« Créer ma cave »**, entrez votre email, mot de passe et votre nom de caviste (ex: *« Cave de Benjamin »*).
3. Une fois connecté, dans le menu latéral en bas à gauche, cliquez sur **« Importer un JSON »**.
4. Sélectionnez votre fichier `cave_backup_2026-05-30 (1).json` (ou n'importe quel autre backup de votre dossier `Cave_Papa`).
5. Toutes vos bouteilles et vos dégustations sont importées dans votre base SQLite sécurisée !
6. Allez dans **« Mon Agencement »** pour créer vos espaces de stockage (cartons, étagères, casiers) selon vos envies, et ouvrez la **Visite 3D** pour admirer votre cave personnalisée !

