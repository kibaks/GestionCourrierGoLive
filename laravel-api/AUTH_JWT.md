# Authentification JWT et permissions (aligné Firebase)

L’API utilise **JWT** (tymon/jwt-auth) et les **mêmes règles de permissions** que Firestore (rôles + direction/service + assignations).

## Installation JWT

Dans le projet Laravel (après avoir copié les fichiers de `laravel-api`) :

```bash
composer require tymon/jwt-auth
php artisan vendor:publish --provider="Tymon\JWTAuth\Providers\LaravelServiceProvider"
php artisan jwt:secret
```

## Configuration

### config/auth.php

Ajouter le garde `api` avec driver `jwt` :

```php
'guards' => [
    'web' => [ ... ],
    'api' => [
        'driver' => 'jwt',
        'provider' => 'users',
        'hash' => false,
    ],
],
'providers' => [
    'users' => [
        'driver' => 'eloquent',
        'model' => App\Models\User::class,
    ],
],
```

### .env

```env
JWT_SECRET=...  # Généré par php artisan jwt:secret
JWT_TTL=60     # Durée de vie du token en minutes (optionnel)
```

## Routes d’authentification

| Méthode | URL | Description |
|--------|-----|-------------|
| POST | `/api/auth/login` | Connexion : `{ "email", "password" }` → `{ "token", "user" }` |
| POST | `/api/auth/register` | Inscription : `{ "name", "email", "password", "password_confirmation", "role?", "direction?", "service?" }` |
| GET | `/api/auth/me` | Utilisateur connecté (header `Authorization: Bearer <token>`) |
| GET | `/api/auth/permissions` | Liste des codes de permission de l'utilisateur (pour le front) |
| POST | `/api/auth/refresh` | Rafraîchir le token |
| POST | `/api/auth/logout` | Invalider le token |

## Utilisation côté front (React)

1. Après `POST /api/auth/login`, stocker le token :  
   `laravelApiService.setAuthToken(data.token)`
2. Envoyer le token sur chaque requête API :  
   `Authorization: Bearer <token>`  
   (déjà géré par `laravelApiService` si `laravel_token` est dans `localStorage`)

## Rôles et permissions (alignés Firebase / Firestore)

- **SUPER_ADMIN** : tous les courriers ; suppression uniquement si créateur ou admin.
- **DIRECTEUR_GENERAL** : tous les courriers ; lecture/écriture.
- **SECRETAIRE** : tous les courriers ; lecture/écriture.
- **DIRECTEUR** : courriers de sa **direction** + courriers qui lui sont **assignés**.
- **CHEF_SERVICE** / **AGENT** : courriers de son **service** et **direction** + courriers **assignés**.

Règles détaillées (comme Firebase) :

- **Liste** (`GET /api/courriers`) : uniquement les courriers accessibles selon le rôle et les assignations.
- **Création** : `enregistre_par` = utilisateur connecté (ou champ fourni).
- **Lecture** (`GET /api/courriers/{id}`) : autorisée si le courrier est accessible (rôle + direction/service + assignation).
- **Modification** : admin, créateur du courrier, ou DG/Directeur/Secrétaire selon les règles.
- **Suppression** : uniquement **SUPER_ADMIN** ou **créateur** du courrier.

## Stockage des courriers (aligné Firebase)

- Champs identiques (numero, type, dateReception, dateEnregistrement, expediteur, destinataire, objet, priorite, statut, direction, service, extraFields, etc.).
- Réponse API : `createdBy` = `enregistre_par` (compatibilité front Firebase).
- Table **assignations** : pour filtrer les courriers « assignés » à un utilisateur (même logique que Firebase).

## Migrations

Exécuter les migrations (courriers, courrier_fichiers, **users**, **assignations**) :

```bash
php artisan migrate
```

Ou avec le script SQL fourni :

```bash
mysql -u root -P 3306 < database/run-migrations.sql
```

## Premier utilisateur (admin)

Créer un utilisateur SUPER_ADMIN (par exemple via Tinker ou une route dédiée) :

```bash
php artisan tinker
>>> App\Models\User::create(['name' => 'Admin', 'email' => 'admin@example.com', 'password' => bcrypt('secret'), 'role' => 'SUPER_ADMIN', 'actif' => true]);
```

Ou utiliser `POST /api/auth/register` avec `role: SUPER_ADMIN` si votre politique le permet.
