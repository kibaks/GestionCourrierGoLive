# Structure des collections Firestore

## 📁 Organisation des collections

### 1. **Courriers** (`courriers`)
```
courriers/
  ├── {courrierId}/
      ├── id: string
      ├── numero: string
      ├── type: TypeCourrier
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
      ├── extraFields: map (champs dynamiques)
      ├── createdAt: Timestamp
      └── updatedAt: Timestamp
```

**Index recommandés** :
- `dateEnregistrement` (desc)
- `statut` + `dateEnregistrement` (desc)
- `type` + `dateEnregistrement` (desc)
- `createdBy` + `dateEnregistrement` (desc)
- `direction` + `dateEnregistrement` (desc)

### 2. **Workflows** (`workflows`)
```
workflows/
  ├── {workflowId}/
      ├── id: string
      ├── courrierId: string
      ├── etapeActuelle: string
      ├── etapes: array
      ├── historique: array
      └── createdAt: Timestamp
```

### 3. **Annotations** (`annotations`)
```
annotations/
  ├── {annotationId}/
      ├── id: string
      ├── courrierId: string
      ├── createdBy: string
      ├── contenu: string
      ├── createdAt: Timestamp
      └── updatedAt: Timestamp
```

### 4. **Assignations** (`assignations`)
```
assignations/
  ├── {assignationId}/
      ├── id: string
      ├── courrierId: string
      ├── assigneA: string (userId)
      ├── assignePar: string (userId)
      ├── dateEcheance: Timestamp
      ├── statut: string
      └── createdAt: Timestamp
```

### 5. **Utilisateurs** (`utilisateurs`)
```
utilisateurs/
  ├── {userId}/
      ├── id: string
      ├── nom: string
      ├── email: string
      ├── role: Role
      ├── directionId: string (optionnel)
      ├── serviceId: string (optionnel)
      ├── actif: boolean
      ├── accessibleDirections: array (pour les permissions)
      ├── accessibleServices: array
      └── createdAt: Timestamp
```

### 6. **Archivage** (`archivage_*`)
```
archivage_locaux/
  ├── {localId}/
      ├── id: string
      ├── nom: string
      ├── code: string
      ├── adresse: string
      ├── photoPanoramique: string (base64 ou URL)
      ├── capacite: number
      ├── actif: boolean
      ├── dateCreation: Timestamp
      └── dateModification: Timestamp

archivage_armoires/
  ├── {armoireId}/
      ├── id: string
      ├── localId: string
      ├── nom: string
      ├── code: string
      └── ...

archivage_etageres/
  ├── {etagereId}/
      ├── id: string
      ├── armoireId: string
      └── ...

archivage_boites/
  ├── {boiteId}/
      ├── id: string
      ├── etagereId: string
      └── ...

archivage_archives/
  ├── {archiveId}/
      ├── id: string
      ├── boiteId: string
      ├── courrierId: string
      └── ...
```

### 7. **Configuration** (`config`)
```
config/
  ├── formulaire/
      ├── EXTERNE: array (sections avec colonnes et champs)
      └── INTERNE: array (sections avec colonnes et champs)
  
  ├── archive3d/
      ├── dimensions: object
      ├── couleurs: object
      └── ...
```

### 8. **Entités Organisationnelles** (`entites_organisationnelles`)
```
entites_organisationnelles/
  ├── {entiteId}/
      ├── id: string
      ├── nom: string
      ├── type: TypeEntiteOrganisationnelle
      ├── parentId: string (optionnel)
      ├── ordre: number
      ├── actif: boolean
      └── ...
```

## 🔍 Index Firestore recommandés

Créer ces index dans Firebase Console → Firestore → Index :

1. **courriers** :
   - `dateEnregistrement` (desc)
   - `statut` + `dateEnregistrement` (desc)
   - `type` + `dateEnregistrement` (desc)
   - `createdBy` + `dateEnregistrement` (desc)
   - `direction` + `dateEnregistrement` (desc)

2. **assignations** :
   - `assigneA` + `statut` + `dateEcheance` (asc)
   - `courrierId` + `createdAt` (desc)

3. **annotations** :
   - `courrierId` + `createdAt` (desc)

4. **archivage_locaux** :
   - `actif` + `nom` (asc)

