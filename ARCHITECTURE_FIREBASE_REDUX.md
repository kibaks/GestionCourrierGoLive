# Architecture Firebase + Redux - Documentation Complète

## 📋 Réponses aux questions d'architecture

### 1. 🔐 Authentification et Règles de Sécurité Firestore

#### Authentification

**Approche choisie : Firebase Authentication**

Nous utilisons **Firebase Authentication** avec email/mot de passe pour gérer l'authentification. Le service `firebaseAuthService` (`src/services/firebaseAuthService.ts`) gère :

- ✅ Connexion (`signIn`)
- ✅ Création de compte (`signUp`)
- ✅ Déconnexion (`signOut`)
- ✅ Écoute des changements d'état (`onAuthStateChanged`)
- ✅ Récupération des données utilisateur depuis Firestore
- ✅ Vérification des rôles et permissions

**Intégration avec Redux** : Le slice `authSlice` (`src/store/slices/authSlice.ts`) synchronise l'état d'authentification avec Redux.

#### Règles de Sécurité Firestore

Les règles complètes sont documentées dans `src/config/firestoreRules.md`. Voici les principes :

**Structure des règles** :
- **Helper functions** : `isAuthenticated()`, `isAdmin()`, `isOwnerOrAdmin()`, `hasRole()`, `hasAccessToEntity()`
- **Permissions basées sur les rôles** : SUPER_ADMIN, DIRECTEUR_GENERAL, DIRECTEUR, CHEF_SERVICE, etc.
- **Permissions basées sur la propriété** : Les utilisateurs peuvent modifier leurs propres données
- **Permissions basées sur les entités** : Accès selon la direction/service de l'utilisateur

**Exemple pour les courriers** :
```javascript
match /courriers/{courrierId} {
  allow read: if isAuthenticated() && (
    isAdmin() ||
    resource.data.createdBy == request.auth.uid ||
    hasAccessToEntity(resource.data.directionId)
  );
  allow create: if isAuthenticated() && 
    request.resource.data.createdBy == request.auth.uid;
  allow update: if isAuthenticated() && (
    isAdmin() || resource.data.createdBy == request.auth.uid
  );
  allow delete: if isAuthenticated() && (
    isAdmin() || resource.data.createdBy == request.auth.uid
  );
}
```

**Pour appliquer les règles** :
1. Aller dans Firebase Console → Firestore Database → Règles
2. Copier le contenu de `src/config/firestoreRules.md`
3. Adapter selon vos besoins spécifiques

---

### 2. 🛠️ Gestion d'État Asynchrone : Redux Toolkit + createAsyncThunk

#### Choix technique : **Redux Toolkit avec createAsyncThunk**

**Pourquoi Redux Toolkit et createAsyncThunk ?**

| Solution | Avantages | Inconvénients | Notre choix |
|----------|-----------|---------------|-------------|
| **Redux Thunk classique** | Simple, léger | Gestion manuelle des états loading/error | ❌ |
| **Redux Saga** | Puissant, testable | Complexe, courbe d'apprentissage élevée | ❌ |
| **RTK Query** | Cache automatique, refetch | Surcharge pour notre cas, Firestore gère déjà le cache | ❌ |
| **createAsyncThunk (RTK)** | ✅ Simple, moderne<br>✅ Gestion automatique pending/fulfilled/rejected<br>✅ Intégré dans Redux Toolkit<br>✅ Parfait pour Firestore | - | ✅ **CHOISI** |

#### Comment ça fonctionne

**1. Actions asynchrones avec createAsyncThunk** :

```typescript
// Exemple : src/store/slices/courriersSlice.ts
export const fetchCourriers = createAsyncThunk(
  'courriers/fetchCourriers',
  async (userId?: string) => {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => convertFirestoreDoc<Courrier>(...));
  }
);
```

**2. États automatiques générés** :
- `fetchCourriers.pending` → `loading: true`
- `fetchCourriers.fulfilled` → `loading: false`, données dans `action.payload`
- `fetchCourriers.rejected` → `loading: false`, erreur dans `action.error`

**3. Utilisation dans les composants** :
```typescript
const dispatch = useAppDispatch();
const { items, loading, error } = useAppSelector(state => state.courriers);

useEffect(() => {
  dispatch(fetchCourriers());
}, [dispatch]);
```

#### Synchronisation en temps réel

Pour la synchronisation en temps réel avec Firestore, nous utilisons `onSnapshot` :

```typescript
// src/store/slices/courriersRealtimeSlice.ts
export const startRealtimeCourriers = createAsyncThunk(
  'courriers/startRealtime',
  async () => {
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const courriers = snapshot.docs.map(...);
      store.dispatch(setCourriers(courriers));
    });
    return unsubscribe;
  }
);
```

**Avantages** :
- ✅ Synchronisation automatique entre tous les clients
- ✅ Pas besoin de polling
- ✅ Mises à jour instantanées

---

### 3. 📁 Structure des Collections Firestore

#### Organisation des collections

La structure complète est documentée dans `src/config/firestoreStructure.md`. Voici un résumé :

#### **1. Courriers** (`courriers/`)
```
courriers/
  └── {courrierId}/
      ├── id: string
      ├── numero: string
      ├── type: TypeCourrier (INTERNE | EXTERNE)
      ├── objet: string
      ├── expediteur: string
      ├── destinataire: string
      ├── dateReception: Timestamp
      ├── dateEnregistrement: Timestamp
      ├── statut: StatutCourrier
      ├── priorite: Priorite
      ├── direction: string
      ├── service: string
      ├── createdBy: string (userId)
      ├── extraFields: map (champs dynamiques du formulaire)
      ├── createdAt: Timestamp
      └── updatedAt: Timestamp
```

**Index recommandés** :
- `dateEnregistrement` (desc)
- `statut` + `dateEnregistrement` (desc)
- `type` + `dateEnregistrement` (desc)
- `createdBy` + `dateEnregistrement` (desc)
- `direction` + `dateEnregistrement` (desc)

#### **2. Utilisateurs** (`utilisateurs/`)
```
utilisateurs/
  └── {userId}/
      ├── id: string
      ├── nom: string
      ├── email: string
      ├── role: Role (SUPER_ADMIN, DIRECTEUR_GENERAL, etc.)
      ├── directionId: string (optionnel)
      ├── serviceId: string (optionnel)
      ├── actif: boolean
      ├── accessibleDirections: array (pour les permissions)
      ├── accessibleServices: array
      └── createdAt: Timestamp
```

**Note** : L'ID du document correspond à l'UID Firebase Auth (`request.auth.uid`)

#### **3. Archivage** (`archivage_*`)
```
archivage_locaux/
  └── {localId}/
      ├── id, nom, code, adresse
      ├── photoPanoramique: string (base64 ou URL)
      ├── capacite, actif
      └── dateCreation, dateModification

archivage_armoires/
  └── {armoireId}/
      ├── id, localId, nom, code
      └── ...

archivage_etageres/
  └── {etagereId}/
      ├── id, armoireId, ...
      └── ...

archivage_boites/
  └── {boiteId}/
      ├── id, etagereId, ...
      └── ...

archivage_archives/
  └── {archiveId}/
      ├── id, boiteId, courrierId
      └── ...
```

#### **4. Configuration** (`config/`)
```
config/
  ├── formulaire/
      ├── EXTERNE: array (sections avec colonnes et champs)
      └── INTERNE: array (sections avec colonnes et champs)
  
  └── archive3d/
      ├── dimensions: object
      └── couleurs: object
```

**Note** : Utilisation de `setDoc` avec un ID fixe (`config/formulaire`) plutôt que `addDoc`

#### **5. Entités Organisationnelles** (`entites_organisationnelles/`)
```
entites_organisationnelles/
  └── {entiteId}/
      ├── id, nom, type
      ├── parentId: string (optionnel, pour hiérarchie)
      ├── ordre: number
      └── actif: boolean
```

#### **6. Workflows, Annotations, Assignations**
```
workflows/
  └── {workflowId}/
      ├── courrierId, etapeActuelle
      └── etapes, historique

annotations/
  └── {annotationId}/
      ├── courrierId, createdBy
      └── contenu, createdAt

assignations/
  └── {assignationId}/
      ├── courrierId, assigneA, assignePar
      └── dateEcheance, statut
```

#### Index Firestore

Un fichier `firestoreIndexes.json` est fourni pour créer automatiquement les index nécessaires via Firebase CLI :

```bash
firebase deploy --only firestore:indexes
```

---

## 🔄 Conversion de Données

### Helpers pour Firestore

Le fichier `src/utils/firestoreHelpers.ts` fournit des fonctions utilitaires :

**1. Conversion Timestamp ↔ Date** :
```typescript
timestampToDate(timestamp: Timestamp | Date | string): Date | null
dateToTimestamp(date: Date | string): Timestamp | null
```

**2. Conversion de documents** :
```typescript
convertFirestoreDoc<T>(doc: any): T  // Timestamp → Date
prepareForFirestore<T>(data: T): any  // Date → Timestamp
```

**Utilisation dans les slices** :
```typescript
// Lecture
const courriers = querySnapshot.docs.map(doc => 
  convertFirestoreDoc<Courrier>({ id: doc.id, ...doc.data() })
);

// Écriture
const prepared = prepareForFirestore(newCourrier);
await addDoc(courriersRef, prepared);
```

---

## 📊 Flux de Données

### 1. Migration initiale (localStorage → Firebase)
```
localStorage → firebaseMigrationService → Firestore → Redux
```

### 2. Opérations normales (après migration)
```
Composant → Redux Action (createAsyncThunk) → Firestore → Redux State → Composant
```

### 3. Synchronisation en temps réel
```
Firestore (changement) → onSnapshot → Redux Action → Redux State → Composant (mise à jour)
```

---

## 🚀 Prochaines Étapes

1. **Configurer Firebase** :
   - Créer le projet Firebase
   - Activer Firestore
   - Activer Authentication
   - Configurer les règles de sécurité

2. **Créer les index** :
   - Importer `firestoreIndexes.json` dans Firebase Console
   - Ou utiliser Firebase CLI

3. **Tester la migration** :
   - Utiliser la page "Migration Firebase" dans Paramètres
   - Vérifier les données dans Firebase Console

4. **Intégrer l'authentification** :
   - Adapter `AuthContext` pour utiliser Firebase Auth
   - Mettre à jour les composants de connexion

5. **Migrer les composants** :
   - Remplacer les appels `courrierService` par les actions Redux
   - Utiliser `useAppSelector` et `useAppDispatch`

---

## 📚 Fichiers de Configuration

- `src/config/firebase.ts` - Configuration Firebase
- `src/config/firestoreRules.md` - Règles de sécurité
- `src/config/firestoreStructure.md` - Structure des collections
- `src/config/firestoreIndexes.json` - Index Firestore

## 🛠️ Services et Utilitaires

- `src/services/firebaseAuthService.ts` - Service d'authentification
- `src/services/firebaseMigrationService.ts` - Service de migration
- `src/utils/firestoreHelpers.ts` - Helpers de conversion

## 📦 Slices Redux

- `src/store/slices/authSlice.ts` - État d'authentification
- `src/store/slices/courriersSlice.ts` - Gestion des courriers
- `src/store/slices/utilisateursSlice.ts` - Gestion des utilisateurs
- `src/store/slices/archivageSlice.ts` - Gestion de l'archivage
- `src/store/slices/formulaireSlice.ts` - Configuration du formulaire
- `src/store/slices/entitesSlice.ts` - Entités organisationnelles
- `src/store/slices/courriersRealtimeSlice.ts` - Synchronisation temps réel

