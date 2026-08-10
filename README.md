# API Laravel (MySQL) – Gestion Courrier

API REST Laravel pour les courriers, utilisée par le front React en stockage à trois niveaux (IndexedDB, MySQL, Firebase).

**Laravel est installé dans ce dossier** : `composer.json`, `artisan`, `bootstrap/`, `public/`, `config/` et les providers sont en place. Après `composer install`, vous pouvez lancer l’API avec `php artisan serve`.

## Prérequis

- PHP 8.2+
- Composer
- MySQL 8+ (ou MariaDB)
- Extension PHP : `pdo_mysql`, `mbstring`, `openssl`, `json`, `uuid`

## Installation (dans le dossier laravel-api)

### 1. Installer les dépendances (obligatoire en premier)

**Option simple :** double-cliquez sur **`installer-et-demarrer.bat`** dans le dossier `laravel-api`. Le script fait : `composer install`, `key:generate`, `jwt:secret`, puis lance `php artisan serve`.

**À la main :** sans `composer install`, le dossier `vendor/` n’existe pas et `php artisan key:generate` échoue avec « Failed opening vendor/autoload.php ».

```bash
cd laravel-api
composer install
```
Attendez la fin du téléchargement, puis passez à l’étape 2.

### 2. Configuration

```bash
cp .env.example .env
php artisan key:generate
php artisan jwt:secret
```

Éditer `.env` et configurer MySQL (port 3306 ou 3307) :

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=gestion_courrier
DB_USERNAME=root
DB_PASSWORD=
APP_URL=http://localhost:8000
```

Créer la base MySQL si besoin (ou exécuter les migrations SQL à la racine : `npm run migrate:mysql`) :

```sql
CREATE DATABASE gestion_courrier CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Migrations

```bash
php artisan migrate
```

Si vous voyez « Table 'courriers' already exists », les migrations ont été mises à jour pour ignorer les tables/colonnes déjà présentes. Relancez `php artisan migrate` : la création de la table sera ignorée et les migrations suivantes (ex. colonne `sens`) s’appliqueront.

Ou utiliser le script SQL à la racine du projet : `node scripts/run-mysql-migrations.mjs` (voir `scripts/README-migration-firebase-mysql.md`).

### 4. CORS (front React sur un autre port)

Pour que le front (ex. `http://localhost:5173`) puisse appeler l’API, configurer CORS.

**Laravel 11** : éditer `config/cors.php` (ou le créer) :

```php
'allowed_origins' => ['http://localhost:5173', 'http://localhost:3000'],
'supports_credentials' => true,
```

Ou publier la config CORS si elle n’existe pas :

```bash
php artisan config:publish cors
```

Puis adapter `allowed_origins` dans `config/cors.php`.

### 5. Démarrer l’API

```bash
cd laravel-api
php artisan serve
```

L’API est disponible sur **http://localhost:8000**.

## Endpoints

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/courriers` | Liste des courriers |
| GET | `/api/courriers?created_by=userId` | Liste filtrée par créateur |
| GET | `/api/courriers/{id}` | Détail d’un courrier |
| POST | `/api/courriers` | Créer un courrier |
| PUT | `/api/courriers/{id}` | Mettre à jour un courrier |
| DELETE | `/api/courriers/{id}` | Supprimer un courrier |

### Fichiers (import)

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/courriers/{courrierId}/fichiers` | Liste des dossiers/fichiers du courrier |
| POST | `/api/courriers/{courrierId}/fichiers` | Importer un fichier (multipart `file`) ou créer un dossier (JSON `nom`, `type: "dossier"`) |
| GET | `/api/fichiers/{id}` | Détail d'un dossier/fichier |
| GET | `/api/fichiers/{id}/download` | Télécharger le fichier |
| PUT | `/api/fichiers/{id}` | Mettre à jour (nom, parentId, estAccuseReception) |
| DELETE | `/api/fichiers/{id}` | Supprimer (et enfants si dossier) |

Les fichiers uploadés sont stockés dans `storage/app/courriers/{courrierId}/fichiers/`. Limite d'upload : 50 Mo par fichier (modifiable dans le contrôleur).

Le corps des requêtes utilise le **camelCase** (ex. `dateReception`, `enregistrePar`, `extraFields`). Les réponses sont au même format.

## Lier le front React

Dans le projet React (GestionCourrier), dans le fichier `.env` :

```env
VITE_LARAVEL_API_URL=http://localhost:8000
```

Redémarrer le serveur Vite après modification du `.env`.

## Authentification JWT

L’API utilise **JWT** (tymon/jwt-auth). Toutes les routes courriers et fichiers sont protégées par `auth:api`. Côté front :

1. Appeler `POST /api/auth/login` avec `email` et `password`.
2. Stocker le token : `laravelApiService.setAuthToken(data.token)`.
3. Les requêtes suivantes envoient automatiquement `Authorization: Bearer <token>` si `laravel_token` est dans `localStorage`.

Voir **AUTH_JWT.md** pour les rôles, permissions et détails de configuration.
