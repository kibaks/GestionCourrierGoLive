# Configuration des Variables d'Environnement sur Vercel

Ce guide explique comment configurer les variables d'environnement nécessaires pour déployer l'application sur Vercel.

## ⚠️ Important

Le fichier `.env` contient des informations sensibles et ne doit **JAMAIS** être commité dans Git. C'est pourquoi il est dans `.gitignore`.

Pour Vercel, vous devez configurer ces variables directement dans le dashboard Vercel.

## 📋 Variables d'Environnement Requises

Voici la liste complète des variables d'environnement nécessaires pour l'application :

### Configuration Firebase (Obligatoire)

Ces valeurs sont disponibles dans la [Console Firebase](https://console.firebase.google.com/) :
- Allez dans **Project Settings** > **General** > **Your apps** > **Web app**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Clé API Firebase | `AIzaSyCV5yNjZP21mTwzXNDf5nGr7TDNWgU9YdY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domaine d'authentification | `gestioncourrier-824cd.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ID du projet Firebase | `gestioncourrier-824cd` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de stockage | `gestioncourrier-824cd.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID de l'expéditeur de messages | `348335665252` |
| `VITE_FIREBASE_APP_ID` | ID de l'application | `1:348335665252:web:2bee57edcec9a4ec546f71` |

### Configuration Google Sign-In (Obligatoire)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Client ID Google OAuth | `865540278652-6em7hk9akgi5be5jqla4o1up61i8n4og.apps.googleusercontent.com` |

### Configuration API Scanner (Optionnel)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `VITE_SCANNER_API_BASE_URL` | URL de base de l'API scanner | `http://localhost:3001` |
| `VITE_API_URL` | URL de l'API | `http://localhost:3001` |

### Mode IndexedDB (Optionnel)

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `VITE_USE_BLOB_STORAGE` | Utiliser IndexedDB au lieu de Firebase Storage | `false` |

## 🚀 Configuration sur Vercel

### Méthode 1 : Via le Dashboard Vercel (Recommandé)

1. **Connectez-vous à Vercel**
   - Allez sur [https://vercel.com](https://vercel.com)
   - Connectez-vous avec votre compte

2. **Sélectionnez votre projet**
   - Cliquez sur votre projet `GestionCourrier` dans le dashboard

3. **Accédez aux paramètres**
   - Cliquez sur l'onglet **Settings** (Paramètres)
   - Dans le menu de gauche, cliquez sur **Environment Variables**

4. **Ajoutez les variables**
   - Cliquez sur **Add New** (Ajouter nouveau)
   - Pour chaque variable :
     - **Key** : Entrez le nom de la variable (ex: `VITE_FIREBASE_API_KEY`)
     - **Value** : Entrez la valeur correspondante
     - **Environment** : Sélectionnez les environnements :
       - ✅ **Production** (pour les déploiements en production)
       - ✅ **Preview** (pour les previews de pull requests)
       - ✅ **Development** (optionnel, pour les déploiements de développement)
     - Cliquez sur **Save**

5. **Répétez pour toutes les variables**
   - Ajoutez toutes les variables listées ci-dessus
   - **Important** : Les variables commençant par `VITE_` sont nécessaires pour Vite

6. **Redéployez l'application**
   - Allez dans l'onglet **Deployments**
   - Cliquez sur les trois points (⋯) du dernier déploiement
   - Sélectionnez **Redeploy**
   - Ou poussez un nouveau commit pour déclencher un nouveau déploiement

### Méthode 2 : Via la CLI Vercel

1. **Installez la CLI Vercel** (si ce n'est pas déjà fait)
   ```bash
   npm install -g vercel
   ```

2. **Connectez-vous**
   ```bash
   vercel login
   ```

3. **Ajoutez les variables une par une**
   ```bash
   vercel env add VITE_FIREBASE_API_KEY
   # Entrez la valeur quand demandé
   # Sélectionnez les environnements (Production, Preview, Development)
   
   vercel env add VITE_FIREBASE_AUTH_DOMAIN
   vercel env add VITE_FIREBASE_PROJECT_ID
   vercel env add VITE_FIREBASE_STORAGE_BUCKET
   vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
   vercel env add VITE_FIREBASE_APP_ID
   vercel env add VITE_GOOGLE_CLIENT_ID
   ```

4. **Vérifiez les variables ajoutées**
   ```bash
   vercel env ls
   ```

## 📝 Liste Complète des Variables à Configurer

Copiez-collez cette liste pour vous assurer de ne rien oublier :

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GOOGLE_CLIENT_ID
```

Variables optionnelles (si nécessaire) :
```
VITE_SCANNER_API_BASE_URL
VITE_API_URL
VITE_USE_BLOB_STORAGE
```

## ✅ Vérification

Après avoir configuré toutes les variables :

1. **Vérifiez dans le dashboard Vercel**
   - Settings → Environment Variables
   - Vous devriez voir toutes les variables listées

2. **Testez le déploiement**
   - Faites un nouveau déploiement
   - Vérifiez les logs de build pour confirmer que les variables sont chargées
   - Testez l'application déployée

3. **Vérifiez les erreurs**
   - Si vous voyez des erreurs liées à Firebase ou Google Sign-In, vérifiez que :
     - Toutes les variables sont correctement configurées
     - Les valeurs sont exactes (pas d'espaces supplémentaires)
     - Les environnements sont correctement sélectionnés

## 🔒 Sécurité

- ⚠️ **Ne partagez jamais** vos valeurs de variables d'environnement
- ⚠️ **Ne commitez jamais** le fichier `.env` dans Git
- ✅ Utilisez `.env.example` comme template (sans valeurs réelles)
- ✅ Configurez les variables directement dans Vercel

## 🆘 Dépannage

### Les variables ne sont pas chargées

- Vérifiez que les noms des variables commencent par `VITE_` (pour Vite)
- Assurez-vous que les environnements sont correctement sélectionnés
- Redéployez l'application après avoir ajouté les variables

### Erreurs Firebase

- Vérifiez que toutes les variables Firebase sont configurées
- Vérifiez que les valeurs correspondent à votre projet Firebase
- Vérifiez les règles de sécurité Firebase

### Erreurs Google Sign-In

- Vérifiez que `VITE_GOOGLE_CLIENT_ID` est correct
- Vérifiez que les domaines autorisés sont configurés dans Google Cloud Console

## 📚 Ressources

- [Documentation Vercel - Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Documentation Firebase](https://firebase.google.com/docs)
- [Documentation Vite - Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

