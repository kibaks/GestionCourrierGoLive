# 🔧 Configuration Firebase Storage

## Problème identifié

Les erreurs CORS avec Firebase Storage indiquent que :
1. **Les règles de sécurité Firebase Storage ne sont pas configurées**
2. **Firebase Storage nécessite des règles explicites** pour autoriser les uploads

## ✅ Solution : Déployer les règles Firebase Storage

### Étape 1 : Vérifier que le fichier `storage.rules` existe

Le fichier `storage.rules` a été créé à la racine du projet avec des règles permissives pour le développement.

### Étape 2 : Déployer les règles

Exécutez la commande suivante dans votre terminal :

```bash
firebase deploy --only storage
```

Si vous n'avez pas Firebase CLI installé :

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only storage
```

### Étape 3 : Vérifier dans la console Firebase

1. Allez dans **Firebase Console** → **Storage**
2. Cliquez sur l'onglet **"Règles"**
3. Vérifiez que les règles sont déployées

## 🔒 Règles de sécurité

### Pour le développement (actuel)

Les règles actuelles permettent l'accès à tous (sans authentification) :

```javascript
allow read: if true;
allow write: if true;
```

### Pour la production (recommandé)

Remplacez les règles par :

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /courriers/{courrierId}/fichiers/{fileName} {
      // Lecture : utilisateurs authentifiés uniquement
      allow read: if request.auth != null;
      
      // Écriture : utilisateurs authentifiés uniquement
      allow write: if request.auth != null;
      
      // Limiter la taille des fichiers à 10 MB
      allow create: if request.resource.size < 10 * 1024 * 1024;
    }
    
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## ⚠️ Note importante

Si vous utilisez un système d'authentification personnalisé (comme actuellement avec localStorage), vous devrez :

1. **Soit** intégrer Firebase Authentication
2. **Soit** utiliser des règles permissives pour le développement (comme actuellement)
3. **Soit** créer des tokens personnalisés pour Firebase Storage

## 🐛 Résolution des erreurs CORS

Les erreurs CORS peuvent également être causées par :

1. **Règles non déployées** → Déployez les règles avec `firebase deploy --only storage`
2. **Bucket Storage non configuré** → Vérifiez dans Firebase Console → Storage
3. **Configuration Firebase incorrecte** → Vérifiez `src/config/firebase.ts`

## 📋 Vérification

Après avoir déployé les règles, testez à nouveau l'upload de fichiers. Les erreurs CORS devraient disparaître.

