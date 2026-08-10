# Implémentation complète de l’API (alignée Firebase / front)

Ce document décrit tout ce qui est exposé par l’API Laravel pour correspondre à l’implémentation Firebase et au front (Gestion Courrier).

## Déjà en place (première phase)

| Module | Firebase / front | API Laravel |
|--------|------------------|-------------|
| **Auth** | Firebase Auth | JWT (tymon/jwt-auth) : login, register, me, refresh, logout |
| **Courriers** | collection `courriers` + permissions | CRUD + filtrage par rôle/assignations (getAccessibleCourriers) |
| **Fichiers courrier** | `courrier_fichiers` + Storage | CRUD dossiers/fichiers + upload + download |
| **Utilisateurs** | table `users` (JWT) | User model + JWT ; pas de CRUD admin |
| **Assignations** | collection `assignations` | Table + modèle pour filtrage ; pas de CRUD API |

## Ajouté pour couvrir toute l’implémentation

| Module | Firebase / front | API Laravel |
|--------|------------------|-------------|
| **Assignations** | CRUD assignations, list by user, by courrier | `AssignationsController` : index, indexByCourrier, store, update, destroy |
| **Annotations** | collection `annotations` | `AnnotationsController` : index par courrier, store |
| **Workflow étapes** | collection `workflow_etapes` | `WorkflowEtapesController` : index par courrier, store, update, addResponse, destroy |
| **Rappels** | collection `rappels` | `RappelsController` : index, store, marquerEnvoye |
| **Utilisateurs (admin)** | Firestore `utilisateurs` / adminService | `UsersController` : index, show, store, update, destroy (SUPER_ADMIN) |
| **Config formulaire** | Firestore `config/formulaire` | `ConfigFormulaireController` : GET/PUT config formulaire (lecture auth, écriture SUPER_ADMIN) |

## Paramétrage (page Paramétres / onglets admin)

| Module front | API Laravel |
|--------------|-------------|
| **GestionRoles** | `RolesController` : CRUD rôles (nom, code, description, permissions[]) |
| **GestionDepartements** | `DepartementsController` : CRUD départements |
| **GestionDirectionsServices** | `EntitesOrganisationnellesController` : CRUD entités (directions, services, sous-services, etc.) ; filtres `?type=`, `?parentId=` |
| **GestionTypesEntites** | `EntiteTypesController` : CRUD types d’entités (Direction, Service, etc. — libellés) |
| **GestionResponsabilites** | `ResponsabilitesController` : CRUD définitions responsabilités (code, libelle, niveau) |
| **GestionFormulaireCourrier** | `ConfigFormulaireController` : GET/PUT config formulaire |
| **GestionParametresExport** | `ConfigController` : GET/PUT `config/export` (paramètres d’export PDF/Excel) |
| **GestionScanners** | `ConfigController` : GET/PUT `config/scanners`, `config/scanner_backend_url` |
| **Archive 3D** | `ConfigController` : GET/PUT `config/archive3d` |

## Tables / migrations

- `courriers`
- `courrier_fichiers`
- `users`
- `assignations`
- `workflow_etapes`
- `annotations`
- `rappels`
- `config` (clés : formulaire, export, scanners, scanner_backend_url, archive3d)
- **Paramétrage** : `roles`, `departements`, `entite_type_definitions`, `entites_organisationnelles`, `responsabilite_definitions`

Tout est inclus dans `database/run-migrations.sql` et dans les migrations PHP `database/migrations/2024_02_01_*`.

## Routes API (toutes sous JWT sauf login/register)

### Auth
- `POST /api/auth/login` — Connexion
- `POST /api/auth/register` — Inscription
- `GET /api/auth/me` — Utilisateur connecté
- `POST /api/auth/refresh` — Rafraîchir le token
- `POST /api/auth/logout` — Déconnexion

### Courriers
- `GET /api/courriers` — Liste (courriers accessibles)
- `GET /api/courriers/{id}` — Détail
- `POST /api/courriers` — Créer
- `PUT /api/courriers/{id}` — Modifier
- `DELETE /api/courriers/{id}` — Supprimer

### Fichiers
- `GET /api/courriers/{courrierId}/fichiers` — Liste
- `POST /api/courriers/{courrierId}/fichiers` — Créer dossier ou upload fichier
- `GET /api/fichiers/{id}` — Détail
- `GET /api/fichiers/{id}/download` — Téléchargement
- `PUT /api/fichiers/{id}` — Modifier
- `DELETE /api/fichiers/{id}` — Supprimer

### Assignations
- `GET /api/assignations` — Liste (par défaut : assignations de l’utilisateur connecté) ; `?assigne_a=userId` si autorisé
- `GET /api/courriers/{courrierId}/assignations` — Liste par courrier
- `POST /api/assignations` — Créer (body : courrierId, assigneA, dateEcheance?, instructions?, statut?)
- `PUT /api/assignations/{id}` — Modifier
- `DELETE /api/assignations/{id}` — Supprimer

### Annotations
- `GET /api/courriers/{courrierId}/annotations` — Liste
- `POST /api/annotations` — Créer (body : courrierId, contenu, type MINUTE|NOTE|COMMENTAIRE, workflowEtapeId?, fichiers?)

### Workflow étapes
- `GET /api/courriers/{courrierId}/workflow-etapes` — Liste
- `POST /api/workflow-etapes` — Créer (courrierId, etape, assigneA, statut?, commentaire?, dureeEstimee?, ordre?, declencheur?, etc.)
- `PUT /api/workflow-etapes/{id}` — Modifier
- `POST /api/workflow-etapes/{id}/responses` — Ajouter une réponse/avis (message, decision?)
- `DELETE /api/workflow-etapes/{id}` — Supprimer

### Rappels
- `GET /api/rappels` — Liste (non envoyés) ; `?assigne_a=userId` si autorisé
- `POST /api/rappels` — Créer (assignationId, courrierId, dateRappel, message?)
- `POST /api/rappels/{id}/envoye` — Marquer comme envoyé

### Utilisateurs (SUPER_ADMIN)
- `GET /api/users` — Liste
- `GET /api/users/{id}` — Détail
- `POST /api/users` — Créer
- `PUT /api/users/{id}` — Modifier
- `DELETE /api/users/{id}` — Supprimer

### Config
- `GET /api/config/formulaire` — Lire la config formulaire courrier
- `PUT /api/config/formulaire` — Écrire (SUPER_ADMIN)
- `GET /api/config/{key}` — Lire une clé (formulaire, export, scanners, scanner_backend_url, archive3d)
- `PUT /api/config/{key}` — Écrire une clé (SUPER_ADMIN)

### Paramétrage (lecture : authentifié ; écriture : SUPER_ADMIN)

- **Rôles** : `GET/POST/PUT/DELETE /api/roles`, `GET /api/roles/{id}`
- **Départements** : `GET/POST/PUT/DELETE /api/departements`, `GET /api/departements/{id}`
- **Entités organisationnelles** (directions, services, sous-services) : `GET/POST/PUT/DELETE /api/entites-organisationnelles`, `GET /api/entites-organisationnelles/{id}` ; filtres : `?type=`, `?parentId=`
- **Types d’entités** (libellés Direction, Service, etc.) : `GET/POST/PUT/DELETE /api/entite-types`, `GET /api/entite-types/{id}`
- **Responsabilités** (définitions) : `GET/POST/PUT/DELETE /api/responsabilites`, `GET /api/responsabilites/{id}` ; filtre : `?niveau=`

## Non implémenté côté API (reste Firebase / front)

- **Archivage** (locaux, armoires, étagères, boîtes, archives) : non exposé dans l’API Laravel.
- **Notifications** : non exposées (Firebase `notifications`).
- **Environnement archivage** (GestionEnvironnementArchivage) : non exposé ; possible extension via `config/archive3d` ou tables dédiées.
