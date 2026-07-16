# Migration vers Firebase et Redux

Ce document explique comment migrer l'application de localStorage vers Firebase avec Redux.

## 📋 Prérequis

1. **Créer un projet Firebase** :
   - Aller sur [Firebase Console](https://console.firebase.google.com/)
   - Créer un nouveau projet
   - Activer Firestore Database
   - Activer Authentication (optionnel pour l'instant)

2. **Récupérer les clés de configuration** :
   - Dans Firebase Console → Paramètres du projet → Vos applications
   - Créer une application Web si ce n'est pas déjà fait
   - Copier les clés de configuration

## 🔧 Configuration

1. **Créer le fichier `.env`** à la racine du projet :
```env
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
```

2. **Configurer les règles Firestore** :
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Courriers - accessible par tous les utilisateurs authentifiés
    match /courriers/{courrierId} {
      allow read, write: if request.auth != null;
    }
    
    // Utilisateurs - lecture pour tous, écriture pour admin
    match /utilisateurs/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role == 'SUPER_ADMIN';
    }
    
    // Archivage
    match /archivage_locaux/{localId} {
      allow read, write: if request.auth != null;
    }
    
    // Configuration
    match /config/{configId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/utilisateurs/$(request.auth.uid)).data.role == 'SUPER_ADMIN';
    }
    
    // Entités organisationnelles
    match /entites_organisationnelles/{entiteId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## 🚀 Migration des données

Pour migrer les données existantes de localStorage vers Firebase :

```typescript
import { firebaseMigrationService } from './services/firebaseMigrationService';

// Migrer toutes les données
await firebaseMigrationService.migrateAll();

// Ou migrer individuellement
await firebaseMigrationService.migrateCourriers();
await firebaseMigrationService.migrateArchivage();
await firebaseMigrationService.migrateFormulaireConfig();
```

## 📦 Structure Redux

### Store
- `src/store/store.ts` - Configuration du store Redux
- `src/store/hooks.ts` - Hooks typés pour utiliser Redux

### Slices
- `src/store/slices/courriersSlice.ts` - Gestion des courriers
- `src/store/slices/utilisateursSlice.ts` - Gestion des utilisateurs
- `src/store/slices/archivageSlice.ts` - Gestion de l'archivage
- `src/store/slices/formulaireSlice.ts` - Configuration du formulaire
- `src/store/slices/entitesSlice.ts` - Entités organisationnelles

## 🔄 Utilisation dans les composants

### Exemple : Récupérer les courriers

```typescript
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchCourriers } from '../store/slices/courriersSlice';

function ListeCourriers() {
  const dispatch = useAppDispatch();
  const { items: courriers, loading, error } = useAppSelector(state => state.courriers);

  useEffect(() => {
    dispatch(fetchCourriers());
  }, [dispatch]);

  if (loading) return <div>Chargement...</div>;
  if (error) return <div>Erreur: {error}</div>;

  return (
    <div>
      {courriers.map(courrier => (
        <div key={courrier.id}>{courrier.numero}</div>
      ))}
    </div>
  );
}
```

### Exemple : Créer un courrier

```typescript
import { useAppDispatch } from '../store/hooks';
import { createCourrier } from '../store/slices/courriersSlice';

function EnregistrerCourrier() {
  const dispatch = useAppDispatch();

  const handleSubmit = async (data) => {
    await dispatch(createCourrier(data));
    // Le courrier est automatiquement ajouté au store
  };

  // ...
}
```

## 📝 Prochaines étapes

1. **Migrer les services existants** :
   - Adapter `courrierService.ts` pour utiliser Redux
   - Adapter les autres services (archivage, formulaire, etc.)

2. **Mettre à jour les composants** :
   - Remplacer les appels directs aux services par les actions Redux
   - Utiliser `useAppSelector` pour accéder aux données

3. **Ajouter la synchronisation en temps réel** (optionnel) :
   - Utiliser `onSnapshot` de Firestore pour mettre à jour automatiquement le store

4. **Gérer l'authentification Firebase** (optionnel) :
   - Intégrer Firebase Auth pour remplacer l'authentification actuelle

## ⚠️ Notes importantes

- Les données sont maintenant stockées dans Firebase, pas dans localStorage
- Redux gère l'état de l'application de manière centralisée
- Les actions Redux sont asynchrones et gèrent automatiquement les erreurs
- La migration des données existantes est nécessaire une seule fois

