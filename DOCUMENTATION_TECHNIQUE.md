# Documentation Technique - Gestion Courrier (RHPME)

## Vue d'ensemble

Plateforme de gestion complète des courriers pour la RDC, avec conformité aux standards ARMP. Application full-stack avec frontend React et backend Laravel.

---

## Architecture Technique

### Stack Frontend
| Technologie | Version | Usage |
|------------|---------|-------|
| React | 18.2 | UI components |
| TypeScript | 5.2 | Typage statique |
| Redux Toolkit | 2.11 | État global |
| Vite | 5.0 | Build tool |
| Tailwind CSS | 3.3 | Styling |
| React Router | 6.20 | Navigation |
| Firebase | 12.7 | Auth + Firestore |
| MUI | 7.3 | UI components |

### Stack Backend
| Technologie | Version | Usage |
|------------|---------|-------|
| Laravel | 11.x | API REST |
| PHP | 8.2+ | Langage serveur |
| MySQL | 8+ | Base de données |
| JWT | tymon/jwt-auth | Authentification |

### Stockage (Trois niveaux)
1. **IndexedDB** - Stockage local offline
2. **Firebase Firestore** - Base de données cloud temps réel
3. **MySQL (Laravel)** - Backend API pour persistence

---

## Structure du Projet

```
/Users/maz/Documents/GestionCourrier/GestionCourrierAll/
├── src/                          # Frontend React + TypeScript
│   ├── components/               # Composants réutilisables
│   │   ├── Layout.tsx            # Layout principal avec sidebar
│   │   ├── Archive3DView.tsx     # Visualisation 3D des archives
│   │   ├── WordEditor.tsx        # Éditeur Word
│   │   └── ExcelEditor.tsx       # Éditeur Excel
│   ├── pages/                    # Pages de l'application
│   │   ├── Login.tsx             # Authentification
│   │   ├── Dashboard.tsx         # Tableau de bord
│   │   ├── ListeCourriers.tsx    # Liste des courriers (600KB+)
│   │   ├── EnregistrerCourrier.tsx # Formulaire courrier
│   │   ├── Workflow.tsx          # Gestion des workflows (175KB+)
│   │   ├── Organigramme.tsx      # Vue hiérarchique
│   │   ├── Archives.tsx          # Module d'archivage
│   │   └── admin/                # Pages administration
│   ├── services/                 # Services métier
│   │   ├── courrierServiceFirebase.ts # Service courriers
│   │   ├── laravelApiService.ts  # API Laravel
│   │   ├── notificationService.ts # Notifications
│   │   └── organigrammeService.ts # Gestion organigramme
│   ├── store/                    # Redux Store
│   │   ├── store.ts              # Configuration store
│   │   └── slices/               # Slices Redux
│   │       ├── courriersSlice.ts
│   │       ├── authSlice.ts
│   │       └── archivageSlice.ts
│   ├── types/                    # Types TypeScript
│   │   └── index.ts              # Types globaux
│   └── context/                  # Contextes React
├── laravel-api/                  # Backend Laravel
│   ├── app/                      # Application Laravel
│   │   ├── Http/Controllers/     # Contrôleurs API
│   │   └── Models/               # Modèles Eloquent
│   ├── routes/                   # Routes API
│   └── database/migrations/    # Migrations MySQL
├── scripts/                      # Scripts utilitaires
└── Documentation/              # Documentation existante
```

---

## Modèles de Données

### Courrier (Entité principale)
```typescript
interface Courrier {
  id: string;
  numero: string;
  type: TypeCourrier;        // INTERNE | EXTERNE
  sens: SensCourrier;        // ENTRANT | SORTANT
  dateReception: Date;
  dateEnregistrement: Date;
  expediteur: string;
  destinataire: string;
  objet: string;
  priorite: Priorite;        // BASSE | NORMALE | HAUTE | URGENTE
  statut: StatutCourrier;    // ENREGISTRE | EN_ATTENTE_DG | ...
  direction?: string;
  service?: string;
  workflow?: WorkflowEtape[];
  assignations?: Assignation[];
  dossierFichiers?: DossierFichier[];
}
```

### Hiérarchie Organisationnelle
```typescript
type TypeEntiteOrganisationnelle =
  | 'direction_generale'   // Niveau 1
  | 'direction'            // Niveau 2
  | 'division'             // Niveau 3
  | 'service'              // Niveau 4
  | 'sous-service'         // Niveau 5
  | 'bureau'               // Niveau 6
  | 'cellule';             // Niveau 7

interface EntiteOrganisationnelle {
  id: string;
  nom: string;
  type: TypeEntiteOrganisationnelle;
  parentId?: string;        // Référence hiérarchique
  responsableId?: string;   // Chef de l'entité
}
```

### Rôles et Permissions
```typescript
enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  DIRECTEUR_GENERAL = 'DIRECTEUR_GENERAL',
  DIRECTEUR = 'DIRECTEUR',
  CHEF_SERVICE = 'CHEF_SERVICE',
  SECRETAIRE = 'SECRETAIRE',
  AGENT = 'AGENT'
}

enum Permission {
  VOIR_COURRIERS,
  CREER_COURRIER,
  MODIFIER_COURRIER,
  SUPPRIMER_COURRIER,
  ASSIGNER_COURRIER,
  // ... 20+ permissions
}
```

### Workflow
```typescript
interface WorkflowEtape {
  id: string;
  courrierId: string;
  etape: string;
  assigneA: string;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
  dureeEstimee?: number;
  ordre?: number;
  declencheur?: {
    type: 'IMMEDIAT' | 'APRES_ETAPE' | 'CONDITION' | 'DATE';
  };
}
```

### Archivage (Structure physique)
```typescript
interface LocalArchivage {
  id: string;
  nom: string;
  code: string;
  photoPanoramique?: string;  // Vue 360°
}

interface Armoire {
  id: string;
  localId: string;
  nom: string;
  nombreEtageres: number;
}

interface Etagere {
  id: string;
  armoireId: string;
  numero: number;
  capaciteBoites: number;
}

interface BoiteArchive {
  id: string;
  etagereId: string;
  code: string;  // QR/Bar code
  annee?: number;
}
```

---

## Flux de Données

### Architecture Redux + Firebase
```
Composant → Action Redux (createAsyncThunk) → Service → Firestore
                                              ↓
Composant ← Mise à jour state Redux ← onSnapshot temps réel
```

### Synchronisation Multi-niveaux
1. **Local** : IndexedDB pour offline
2. **Cloud** : Firestore pour sync temps réel
3. **API** : Laravel pour persistence et backups

### Sécurité par rôles
```
SUPER_ADMIN        → Tous les courriers
DIRECTEUR_GENERAL  → Courriers assignés + entrants
DIRECTEUR          → Courriers de sa direction
CHEF_SERVICE       → Courriers de son service
SECRETAIRE         → Tous les courriers (lecture)
AGENT              → Courriers assignés uniquement
```

---

## API Endpoints (Laravel)

### Courriers
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/courriers` | Liste paginée |
| GET | `/api/courriers/{id}` | Détail |
| POST | `/api/courriers` | Création |
| PUT | `/api/courriers/{id}` | Mise à jour |
| DELETE | `/api/courriers/{id}` | Suppression |

### Fichiers
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/courriers/{id}/fichiers` | Liste fichiers |
| POST | `/api/courriers/{id}/fichiers` | Upload (max 50Mo) |
| GET | `/api/fichiers/{id}/download` | Téléchargement |

### Authentification
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | JWT token |
| POST | `/api/auth/logout` | Révocation |
| GET | `/api/auth/me` | Profil utilisateur |

---

## Collections Firestore

```
courriers/{courrierId}
├── id, numero, type, objet
├── expediteur, destinataire
├── statut, priorite
├── direction, service
├── createdBy, createdAt, updatedAt
└── extraFields (champs dynamiques)

utilisateurs/{userId}
├── id, nom, email
├── role (SUPER_ADMIN, DG, etc.)
├── directionId, serviceId
├── accessibleDirections[]
└── actif

entites_organisationnelles/{entiteId}
├── id, nom, type
├── parentId (hiérarchie)
├── ordre, actif
└── responsableId

archivage_locaux/{localId}
archivage_armoires/{armoireId}
archivage_etageres/{etagereId}
archivage_boites/{boiteId}
archivage_archives/{archiveId}

workflows/{workflowId}
annotations/{annotationId}
assignations/{assignationId}
config/formulaire (configuration formulaire)
```

---

## Points d'entrée Principaux

### Frontend
- `@/src/main.tsx:287-294` - Point d'entrée React
- `@/src/store/store.ts:22-51` - Configuration Redux
- `@/src/services/courrierServiceFirebase.ts:21-35` - Service courriers

### Backend
- `@/laravel-api/routes/api.php` - Routes API
- `@/laravel-api/app/Http/Controllers/CourrierController.php` - CRUD courriers

---

## Scripts Disponibles

```bash
# Frontend
npm run dev              # Serveur dev Vite
npm run build            # Build production

# Backend Laravel
cd laravel-api
php artisan serve        # API sur :8000
php artisan migrate        # Migrations MySQL

# Migration de données
npm run migrate:mysql           # Migrations SQL
npm run migrate:firebase-mysql  # Firebase → MySQL
```

---

## Configuration requise

### Variables d'environnement (.env)
```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_DATABASE_URL=

# Laravel API
VITE_LARAVEL_API_URL=http://localhost:8000

# Mode stockage
VITE_STORAGE_MODE=indexeddb|firebase|mysql
```

---

## Fonctionnalités Clés

### 1. Gestion des Courriers
- Enregistrement entrants/sortants
- Hiérarchie multi-niveaux (DG → Directions → Divisions → Services)
- Fichiers joints hiérarchiques (dossiers/sous-dossiers)
- Champs dynamiques configurables

### 2. Workflows
- Étapes conditionnelles (SI/ALORS/SINON)
- Déclencheurs temporels
- Assignation automatique par rôle
- Suivi en temps réel

### 3. Archivage Physique
- Localisation 3D (Local → Armoire → Étagère → Boîte)
- Vue panoramique 360°
- QR/Bar codes pour traçabilité
- Durées de conservation configurables

### 4. Organigramme
- Visualisation hiérarchique interactive
- Gestion des responsabilités
- Filtrage par entité

---

## Dépannage

### Problèmes courants
| Symptôme | Cause | Solution |
|----------|-------|----------|
| Courriers non visibles | Auth non prête | Attendre authReady |
| Permissions refusées | Règles Firestore | Vérifier firestore.rules |
| Sync lente | Index manquants | Déployer firestore.indexes.json |
| API 401 | Token JWT expiré | Reconnexion |

---

## Documentation Existante

- `@/ARCHITECTURE_FIREBASE_REDUX.md` - Architecture détaillée
- `@/CONFIGURATION_FIREBASE_DEPLOIEMENT.md` - Déploiement
- `@/MIGRATION_FIREBASE.md` - Migration données
- `@/SYNCHRONISATION_TEMPS_REEL.md` - Sync temps réel
- `@/STOCKAGE_TROIS_NIVEAUX.md` - Architecture stockage

---

## Prochaines Étapes recommandées

1. **Tests** - Implémenter tests unitaires (Jest/Vitest)
2. **Documentation API** - Swagger/OpenAPI pour Laravel
3. **Monitoring** - Logs et analytics Firebase
4. **CI/CD** - GitHub Actions pour déploiement
5. **Optimisation** - Code-splitting pour pages lourges
