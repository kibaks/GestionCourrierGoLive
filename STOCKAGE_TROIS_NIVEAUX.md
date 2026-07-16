# Stockage à trois niveaux (IndexedDB, MySQL/Laravel, Firebase)

L’application enregistre les courriers à **trois niveaux** :

1. **IndexedDB** (navigateur) — stockage local immédiat, lecture/écriture instantanée.
2. **API Laravel / MySQL** — serveur principal ; lecture/écriture via `VITE_LARAVEL_API_URL`.
3. **Firebase (Firestore)** — sauvegarde cloud et synchronisation multi-appareils.

## Stratégie

- **Chargement (lecture)** :  
  les données sont **chargées depuis MySQL via l’API Laravel** (source de vérité). Le résultat est mis en cache dans IndexedDB. Si l’API Laravel est indisponible (hors ligne ou erreur), l’app utilise le cache IndexedDB puis Firebase en secours.
- **Écriture** (création, mise à jour, suppression) :  
  d’abord **IndexedDB** (réponse immédiate), puis **Laravel (MySQL)** si l’API est configurée, puis **Firebase** (sauvegarde cloud).

Si Laravel ou Firebase est indisponible, les opérations sont quand même faites en local (IndexedDB) et une entrée est ajoutée dans une file de synchronisation pour retry ultérieur.

## Configuration

### 1. IndexedDB

Aucune configuration. La base locale `GestionCourrierDB` est créée automatiquement dans le navigateur.

### 2. API Laravel (MySQL)

Une **API Laravel complète** est fournie dans le dossier **`laravel-api/`** (modèle, contrôleur, migration, routes). Voir **`laravel-api/README.md`** pour l’installation (créer un projet Laravel, copier les fichiers, configurer MySQL, migrations, CORS).

Dans votre fichier `.env` à la racine du projet React :

```env
VITE_LARAVEL_API_URL=http://localhost:8000
```

Remplacez par l’URL de votre API Laravel (sans slash final).

**Endpoints fournis par l’API (dossier laravel-api) :**

| Méthode | URL | Description |
|--------|-----|-------------|
| GET | `/api/courriers` | Liste des courriers (optionnel : `?created_by=userId`) |
| POST | `/api/courriers` | Créer un courrier (body JSON) |
| PUT | `/api/courriers/{id}` | Mettre à jour un courrier |
| DELETE | `/api/courriers/{id}` | Supprimer un courrier |

**Authentification :**  
Le client envoie un token dans l’en-tête `Authorization: Bearer <token>`.  
Stocker le token après login Laravel/Sanctum dans `localStorage` sous la clé `laravel_token` (ou `auth_token`).  
Vous pouvez utiliser `laravelApiService.setAuthToken(token)` depuis le code.

### 3. Firebase

Configuration inchangée (variables `VITE_FIREBASE_*` dans `.env`).  
Firebase reste utilisé pour la sauvegarde cloud et la persistance même si Laravel n’est pas configuré.

## Fichiers concernés

- `src/services/indexedDBStorageService.ts` — accès IndexedDB (courriers, file de sync).
- `src/services/laravelApiService.ts` — client HTTP vers l’API Laravel.
- `src/services/storageSyncService.ts` — orchestration des trois niveaux (lecture/écriture).
- `src/store/slices/courriersSlice.ts` — thunks Redux qui appellent `storageSyncService`.

## Désactiver un niveau

- **Sans Laravel :** ne pas définir `VITE_LARAVEL_API_URL` (ou laisser vide). Comportement : IndexedDB + Firebase uniquement.
- **Sans Firebase :** possible uniquement en modifiant le code (le sync service appelle encore Firestore). Pour un mode 100 % local + Laravel, il faudrait désactiver les appels Firebase dans `storageSyncService.ts`.

## File de synchronisation

Les opérations qui échouent vers Laravel ou Firebase sont enregistrées dans IndexedDB (`sync_queue`).  
Une future évolution peut consommer cette file (retry automatique ou bouton « Resynchroniser »).
