# Guide : Création des Index Firestore

Il existe **deux méthodes** pour créer les index Firestore. Choisissez celle qui vous convient le mieux.

---

## 📋 Méthode 1 : Via Firebase Console (Interface Graphique)

### Étape 1 : Accéder à Firebase Console
1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Dans le menu de gauche, cliquez sur **Firestore Database**
4. Cliquez sur l'onglet **Index**

### Étape 2 : Créer les index manuellement

Pour chaque index, cliquez sur **"Créer un index"** et remplissez les champs :

#### Index 1 : Courriers par date d'enregistrement
- **Collection ID** : `courriers`
- **Champs à indexer** :
  - `dateEnregistrement` → **Ordre décroissant** (Descending)

#### Index 2 : Courriers par statut et date
- **Collection ID** : `courriers`
- **Champs à indexer** :
  - `statut` → **Ordre croissant** (Ascending)
  - `dateEnregistrement` → **Ordre décroissant** (Descending)

#### Index 3 : Courriers par type et date
- **Collection ID** : `courriers`
- **Champs à indexer** :
  - `type` → **Ordre croissant** (Ascending)
  - `dateEnregistrement` → **Ordre décroissant** (Descending)

#### Index 4 : Courriers par créateur et date
- **Collection ID** : `courriers`
- **Champs à indexer** :
  - `createdBy` → **Ordre croissant** (Ascending)
  - `dateEnregistrement` → **Ordre décroissant** (Descending)

#### Index 5 : Courriers par direction et date
- **Collection ID** : `courriers`
- **Champs à indexer** :
  - `direction` → **Ordre croissant** (Ascending)
  - `dateEnregistrement` → **Ordre décroissant** (Descending)

#### Index 6 : Assignations par utilisateur, statut et échéance
- **Collection ID** : `assignations`
- **Champs à indexer** :
  - `assigneA` → **Ordre croissant** (Ascending)
  - `statut` → **Ordre croissant** (Ascending)
  - `dateEcheance` → **Ordre croissant** (Ascending)

#### Index 7 : Annotations par courrier et date
- **Collection ID** : `annotations`
- **Champs à indexer** :
  - `courrierId` → **Ordre croissant** (Ascending)
  - `createdAt` → **Ordre décroissant** (Descending)

### ⏱️ Temps de création
Les index peuvent prendre quelques minutes à être créés. Vous verrez un statut "En cours de création" puis "Activé" une fois terminé.

---

## 🚀 Méthode 2 : Via Firebase CLI (Automatique)

Cette méthode est plus rapide et permet de déployer tous les index en une seule commande.

### Prérequis
1. Installer Firebase CLI :
   ```bash
   npm install -g firebase-tools
   ```

2. Se connecter à Firebase :
   ```bash
   firebase login
   ```

3. Initialiser Firebase dans le projet (si pas déjà fait) :
   ```bash
   firebase init firestore
   ```
   - Sélectionnez votre projet Firebase
   - Choisissez d'utiliser un fichier de règles existant (si vous avez déjà `firestore.rules`)
   - Choisissez d'utiliser un fichier d'index existant : **OUI**
   - Chemin du fichier d'index : `src/config/firestoreIndexes.json`

### Déployer les index

Une fois la configuration terminée, déployez les index :

```bash
firebase deploy --only firestore:indexes
```

Cette commande va :
- ✅ Lire le fichier `firestore.indexes.json` (ou celui que vous avez configuré)
- ✅ Créer tous les index définis
- ✅ Afficher la progression de la création

### Structure des fichiers Firebase

Pour utiliser Firebase CLI, vous devez avoir cette structure :

```
votre-projet/
├── firebase.json          (configuration Firebase)
├── .firebaserc           (projet Firebase sélectionné)
└── firestore.indexes.json (index Firestore)
```

**Note** : Le fichier `firestoreIndexes.json` doit être à la racine du projet et s'appeler `firestore.indexes.json` pour que Firebase CLI le reconnaisse automatiquement.

---

## 🔧 Configuration Firebase CLI

Si vous n'avez pas encore configuré Firebase CLI, voici comment faire :

### 1. Créer `firebase.json`

Créez un fichier `firebase.json` à la racine du projet :

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

### 2. Créer `.firebaserc`

Créez un fichier `.firebaserc` à la racine du projet :

```json
{
  "projects": {
    "default": "votre-project-id"
  }
}
```

Remplacez `votre-project-id` par l'ID de votre projet Firebase.

### 3. Copier le fichier d'index

Copiez `src/config/firestoreIndexes.json` vers la racine et renommez-le en `firestore.indexes.json` :

```bash
# Windows PowerShell
Copy-Item src\config\firestoreIndexes.json firestore.indexes.json

# Linux/Mac
cp src/config/firestoreIndexes.json firestore.indexes.json
```

### 4. Déployer

```bash
firebase deploy --only firestore:indexes
```

---

## ✅ Vérification

Après la création (via Console ou CLI), vérifiez que les index sont bien créés :

1. Allez dans Firebase Console → Firestore Database → Index
2. Vous devriez voir tous les index listés avec le statut **"Activé"**

---

## 🐛 Résolution de problèmes

### Erreur : "Index nécessaire pour cette requête"

Si vous recevez cette erreur lors d'une requête :
1. Firebase va automatiquement proposer de créer l'index manquant
2. Cliquez sur le lien dans l'erreur
3. Cela vous redirigera vers la console pour créer l'index

### Index en cours de création

Les index peuvent prendre **plusieurs minutes** à être créés. Pendant ce temps :
- Les requêtes qui nécessitent cet index échoueront
- Attendez que l'index soit "Activé" avant d'utiliser la requête

### Firebase CLI ne trouve pas le fichier

Assurez-vous que :
- Le fichier s'appelle exactement `firestore.indexes.json` (avec un point)
- Il est à la racine du projet
- Le chemin dans `firebase.json` est correct

---

## 📝 Notes importantes

- ⚠️ **Les index prennent de l'espace** : Chaque index consomme de l'espace de stockage
- ⚠️ **Coût** : Les index peuvent augmenter les coûts de Firestore
- ✅ **Performance** : Les index améliorent considérablement les performances des requêtes
- ✅ **Automatique** : Firebase peut suggérer des index manquants lors des requêtes

---

## 🎯 Recommandation

Pour un **déploiement rapide et reproductible**, utilisez **Firebase CLI** (Méthode 2).

Pour un **apprentissage et contrôle manuel**, utilisez **Firebase Console** (Méthode 1).
