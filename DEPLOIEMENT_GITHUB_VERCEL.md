# 🚀 Guide de Déploiement : GitHub + Vercel

Ce guide vous explique comment déployer votre application sur GitHub et Vercel.

---

## 📋 Prérequis

- ✅ Compte GitHub
- ✅ Compte Vercel (gratuit)
- ✅ Git installé sur votre machine
- ✅ Application fonctionnelle localement

---

## 🔧 Étape 1 : Préparer le Projet pour GitHub

### 1.1 Vérifier/Créer `.gitignore`

Assurez-vous que votre `.gitignore` contient :

```gitignore
# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage

# Production
/dist
/build

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Firebase
.firebase/
firebase-debug.log
firestore-debug.log
.firebaserc
firebase.json

# OS
Thumbs.db
```

**⚠️ IMPORTANT** : Ne jamais commiter le fichier `.env` !

### 1.2 Initialiser Git (si pas déjà fait)

```bash
# Vérifier si Git est déjà initialisé
git status

# Si erreur, initialiser Git
git init

# Ajouter tous les fichiers
git add .

# Premier commit
git commit -m "Initial commit: Application Gestion Courrier"
```

---

## 📤 Étape 2 : Créer le Repository GitHub

### 2.1 Créer un nouveau repository sur GitHub

1. Allez sur [GitHub](https://github.com)
2. Cliquez sur **"New repository"** (ou le bouton **+** en haut à droite)
3. Remplissez :
   - **Repository name** : `gestion-courrier` (ou le nom de votre choix)
   - **Description** : "Application de gestion de courriers avec Firebase et Redux"
   - **Visibility** : Public ou Private (selon vos préférences)
   - **Ne cochez PAS** "Initialize with README" (si vous avez déjà des fichiers)
4. Cliquez sur **"Create repository"**

### 2.2 Connecter le projet local à GitHub

GitHub vous donnera des commandes. Utilisez celles-ci :

```bash
# Ajouter le remote GitHub
git remote add origin https://github.com/VOTRE_USERNAME/gestion-courrier.git

# Renommer la branche principale en 'main' (si nécessaire)
git branch -M main

# Pousser le code vers GitHub
git push -u origin main
```

**Note** : Remplacez `VOTRE_USERNAME` par votre nom d'utilisateur GitHub.

---

## 🌐 Étape 3 : Configurer Vercel

### 3.1 Créer un compte Vercel

1. Allez sur [Vercel](https://vercel.com)
2. Cliquez sur **"Sign Up"**
3. Choisissez **"Continue with GitHub"** (recommandé pour l'intégration automatique)
4. Autorisez Vercel à accéder à votre compte GitHub

### 3.2 Importer le projet depuis GitHub

1. Dans le dashboard Vercel, cliquez sur **"Add New..."** → **"Project"**
2. Sélectionnez votre repository `gestion-courrier`
3. Cliquez sur **"Import"**

### 3.3 Configurer le projet

Vercel détecte automatiquement Vite. Vérifiez la configuration :

- **Framework Preset** : Vite
- **Root Directory** : `./` (racine du projet)
- **Build Command** : `npm run build` (ou `yarn build`)
- **Output Directory** : `dist`
- **Install Command** : `npm install` (ou `yarn install`)

Cliquez sur **"Deploy"** (vous pourrez configurer les variables d'environnement après).

---

## 🔐 Étape 4 : Configurer les Variables d'Environnement sur Vercel

### 4.1 Accéder aux paramètres du projet

1. Dans le dashboard Vercel, cliquez sur votre projet
2. Allez dans **"Settings"** → **"Environment Variables"**

### 4.2 Ajouter les variables Firebase

Ajoutez toutes les variables de votre fichier `.env` :

| Variable | Valeur |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | `AIzaSyCV5yNjZP21mTwzXNDf5nGr7TDNWgU9YdY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `gestioncourrier-824cd.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `gestioncourrier-824cd` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `gestioncourrier-824cd.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `348335665252` |
| `VITE_FIREBASE_APP_ID` | `1:348335665252:web:2bee57edcec9a4ec546f71` |

**Important** :
- ✅ Cochez **"Production"**, **"Preview"**, et **"Development"** pour chaque variable
- ✅ Cliquez sur **"Save"** après chaque variable

### 4.3 Redéployer après avoir ajouté les variables

1. Allez dans l'onglet **"Deployments"**
2. Cliquez sur les **3 points** (⋯) du dernier déploiement
3. Cliquez sur **"Redeploy"**

---

## 🔄 Étape 5 : Déploiement Automatique

### 5.1 Fonctionnement

Une fois configuré, Vercel déploie automatiquement :
- ✅ **À chaque push sur `main`** → Déploiement en production
- ✅ **À chaque pull request** → Déploiement en preview
- ✅ **À chaque commit** → Nouveau déploiement

### 5.2 Workflow recommandé

```bash
# 1. Faire des modifications localement
# ... modifier le code ...

# 2. Commiter les changements
git add .
git commit -m "Description des modifications"

# 3. Pousser vers GitHub
git push origin main

# 4. Vercel déploie automatiquement ! 🚀
```

---

## 📝 Étape 6 : Créer un README.md (Optionnel mais recommandé)

Créez un fichier `README.md` à la racine du projet :

```markdown
# Gestion Courrier

Application de gestion de courriers avec Firebase et Redux.

## 🚀 Déploiement

L'application est déployée sur Vercel : [lien-vers-votre-app.vercel.app]

## 🛠️ Technologies

- React + TypeScript
- Vite
- Firebase (Firestore, Auth)
- Redux Toolkit
- Tailwind CSS

## 📦 Installation

\`\`\`bash
npm install
npm run dev
\`\`\`

## 🔐 Variables d'Environnement

Voir `.env.example` pour la liste des variables requises.

## 📚 Documentation

- [Architecture Firebase + Redux](./ARCHITECTURE_FIREBASE_REDUX.md)
- [Guide de Migration](./MIGRATION_FIREBASE.md)
```

Puis commitez :

```bash
git add README.md
git commit -m "Add README.md"
git push origin main
```

---

## 🔧 Étape 7 : Configuration Avancée Vercel

### 7.1 Domaine personnalisé (Optionnel)

1. Dans Vercel → **Settings** → **Domains**
2. Ajoutez votre domaine personnalisé
3. Suivez les instructions pour configurer les DNS

### 7.2 Variables d'environnement par environnement

Vous pouvez avoir des variables différentes pour :
- **Production** : Variables de production
- **Preview** : Variables de test/staging
- **Development** : Variables de développement local

### 7.3 Build Settings

Si nécessaire, modifiez dans **Settings** → **General** → **Build & Development Settings**

---

## 🐛 Résolution de Problèmes

### Problème 1 : Build échoue sur Vercel

**Solution** :
1. Vérifiez les logs de build dans Vercel
2. Assurez-vous que `package.json` contient le script `build`
3. Vérifiez que toutes les dépendances sont dans `dependencies` (pas `devDependencies`)

### Problème 2 : Variables d'environnement non chargées

**Solution** :
1. Vérifiez que les variables commencent par `VITE_`
2. Redéployez après avoir ajouté les variables
3. Vérifiez que les variables sont cochées pour l'environnement correct

### Problème 3 : Erreurs Firebase en production

**Solution** :
1. Vérifiez que les règles Firestore autorisent les requêtes depuis votre domaine Vercel
2. Vérifiez que les variables Firebase sont correctes
3. Vérifiez les logs dans la console Firebase

### Problème 4 : Routes ne fonctionnent pas (404)

**Solution** :
Créez un fichier `vercel.json` à la racine :

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 📋 Checklist de Déploiement

### Avant de déployer

- [ ] `.gitignore` contient `.env`
- [ ] `.env` n'est pas dans Git (vérifier avec `git status`)
- [ ] `package.json` contient le script `build`
- [ ] L'application fonctionne localement (`npm run build`)

### Sur GitHub

- [ ] Repository créé
- [ ] Code poussé vers GitHub
- [ ] README.md ajouté (optionnel)

### Sur Vercel

- [ ] Projet importé depuis GitHub
- [ ] Variables d'environnement configurées
- [ ] Premier déploiement réussi
- [ ] Application accessible via l'URL Vercel

### Après le déploiement

- [ ] Tester l'application en production
- [ ] Vérifier que Firebase fonctionne
- [ ] Tester l'authentification (si implémentée)
- [ ] Configurer un domaine personnalisé (optionnel)

---

## 🎯 Commandes Rapides

### Workflow quotidien

```bash
# 1. Modifier le code
# ... faire des modifications ...

# 2. Commiter
git add .
git commit -m "Description des changements"

# 3. Pousser (déploie automatiquement sur Vercel)
git push origin main
```

### Vérifier le statut

```bash
# Vérifier les fichiers modifiés
git status

# Voir l'historique des commits
git log --oneline

# Voir les remotes
git remote -v
```

---

## 🔗 Liens Utiles

- **GitHub** : https://github.com
- **Vercel Dashboard** : https://vercel.com/dashboard
- **Documentation Vercel** : https://vercel.com/docs
- **Documentation Vite** : https://vitejs.dev

---

## ✅ Résumé

1. **GitHub** : Créer repository → Pousser le code
2. **Vercel** : Importer depuis GitHub → Configurer les variables → Déployer
3. **Automatique** : Chaque push sur `main` déploie automatiquement

**Temps estimé** : 10-15 minutes pour la configuration initiale.

---

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs dans Vercel (onglet "Deployments" → Cliquez sur un déploiement)
2. Vérifiez la console du navigateur pour les erreurs
3. Consultez la documentation Vercel

**Bon déploiement ! 🚀**

