# 🔐 Connecter un Repository GitHub Privé à Vercel

Ce guide explique comment connecter votre repository GitHub **privé** à Vercel.

---

## 🎯 Méthode Recommandée : Via l'Interface Web Vercel (OAuth)

C'est la méthode la plus simple et sécurisée. Vercel gère automatiquement l'authentification OAuth avec GitHub.

### Étape 1 : Créer un Personal Access Token GitHub (si nécessaire)

Si Vercel ne peut pas accéder à votre repository privé, vous devrez peut-être créer un token :

1. Allez sur [GitHub.com](https://github.com)
2. Cliquez sur votre **profil** (en haut à droite) → **Settings**
3. Dans le menu de gauche, allez dans **Developer settings**
4. Cliquez sur **Personal access tokens** → **Tokens (classic)**
5. Cliquez sur **Generate new token** → **Generate new token (classic)**
6. Remplissez :
   - **Note** : "Vercel - Gestion Courrier"
   - **Expiration** : 90 days (ou No expiration)
   - **Scopes** : Cochez **`repo`** (accès complet aux repositories privés)
7. Cliquez sur **Generate token**
8. **⚠️ IMPORTANT** : Copiez le token immédiatement (vous ne pourrez plus le voir !)

### Étape 2 : Connecter Vercel à GitHub

#### Option A : Via l'Interface Web (Recommandé)

1. Allez sur [https://vercel.com](https://vercel.com)
2. **Connectez-vous** ou **Créez un compte**
3. Cliquez sur **"Add New..."** → **"Project"**
4. Cliquez sur **"Import Git Repository"**
5. Si c'est la première fois :
   - Cliquez sur **"Connect GitHub"** ou **"Configure GitHub App"**
   - Autorisez Vercel à accéder à votre compte GitHub
   - Sélectionnez les repositories que Vercel peut accéder :
     - ✅ **All repositories** (recommandé)
     - OU ✅ **Only select repositories** → Sélectionnez votre repository privé
6. Votre repository privé apparaîtra dans la liste
7. Cliquez sur **"Import"** à côté de votre repository

#### Option B : Si le repository privé n'apparaît pas

Si votre repository privé n'apparaît pas dans la liste :

1. Dans Vercel, allez dans **Settings** → **Git** → **GitHub**
2. Cliquez sur **"Configure GitHub App"** ou **"Reconnect"**
3. Assurez-vous que l'autorisation inclut votre repository privé
4. Si nécessaire, allez sur GitHub → **Settings** → **Applications** → **Authorized OAuth Apps**
5. Trouvez **Vercel** et vérifiez les permissions

### Étape 3 : Configurer le Projet sur Vercel

Une fois le repository importé :

1. **Framework Preset** : Vite (détecté automatiquement)
2. **Root Directory** : `./` (racine)
3. **Build Command** : `npm run build`
4. **Output Directory** : `dist`
5. **Install Command** : `npm install`

### Étape 4 : Ajouter les Variables d'Environnement

1. Dans la page de configuration, allez dans **"Environment Variables"**
2. Ajoutez vos variables Firebase (commençant par `VITE_`) :
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Cochez **Production**, **Preview**, et **Development** pour chaque variable
4. Cliquez sur **"Deploy"**

---

## 🔧 Méthode Alternative : Via Vercel CLI avec Token

Si vous préférez utiliser le CLI :

### Étape 1 : Créer un Personal Access Token GitHub

Suivez les étapes de la section "Étape 1" ci-dessus pour créer un token GitHub.

### Étape 2 : Configurer Git avec le Token

**Option A : Utiliser HTTPS avec Token**

```bash
# Remplacer VOTRE_TOKEN par votre Personal Access Token
# Remplacer VOTRE_USERNAME par votre nom d'utilisateur GitHub
# Remplacer NOM_REPO par le nom de votre repository

git remote set-url origin https://VOTRE_TOKEN@github.com/VOTRE_USERNAME/NOM_REPO.git
```

**Option B : Utiliser SSH (Recommandé pour la sécurité)**

1. Générez une clé SSH si vous n'en avez pas :
   ```bash
   ssh-keygen -t ed25519 -C "votre.email@example.com"
   ```

2. Ajoutez la clé publique à GitHub :
   - Copiez le contenu de `~/.ssh/id_ed25519.pub`
   - GitHub → Settings → SSH and GPG keys → New SSH key
   - Collez la clé

3. Configurez Git pour utiliser SSH :
   ```bash
   git remote set-url origin git@github.com:VOTRE_USERNAME/NOM_REPO.git
   ```

### Étape 3 : Pousser le Code vers GitHub

```bash
# Vérifier que le code est bien commité
git status

# Pousser vers GitHub
git push -u origin main
```

### Étape 4 : Connecter Vercel via CLI

```bash
# Se connecter à Vercel
vercel login

# Lier le projet à Vercel
vercel link

# Déployer
vercel --prod
```

---

## 🔑 Utiliser un Personal Access Token avec Vercel CLI

Si vous voulez utiliser un token directement :

### Étape 1 : Créer un Token Vercel

1. Allez sur [Vercel Dashboard](https://vercel.com/account/tokens)
2. Cliquez sur **"Create Token"**
3. Donnez un nom : "Gestion Courrier CLI"
4. Copiez le token

### Étape 2 : Utiliser le Token

```bash
# Définir le token Vercel
export VERCEL_TOKEN="votre_token_vercel"

# Ou utiliser directement
vercel --token="votre_token_vercel" --prod
```

---

## ✅ Vérification

### Vérifier que Vercel peut accéder au repository

1. Allez sur [Vercel Dashboard](https://vercel.com/dashboard)
2. Cliquez sur votre projet
3. Allez dans **Settings** → **Git**
4. Vous devriez voir votre repository GitHub listé

### Vérifier les déploiements automatiques

1. Faites un petit changement dans votre code
2. Commitez et poussez :
   ```bash
   git add .
   git commit -m "Test déploiement automatique"
   git push origin main
   ```
3. Allez sur Vercel Dashboard
4. Vous devriez voir un nouveau déploiement en cours

---

## 🐛 Résolution de Problèmes

### Problème 1 : Repository privé n'apparaît pas dans Vercel

**Solutions** :
1. Vérifiez que vous avez autorisé Vercel à accéder à votre compte GitHub
2. Allez sur GitHub → Settings → Applications → Authorized OAuth Apps
3. Trouvez Vercel et vérifiez les permissions
4. Si nécessaire, révoquez et réautorisez Vercel

### Problème 2 : Erreur "Repository not found"

**Solutions** :
1. Vérifiez que le repository existe et que vous y avez accès
2. Vérifiez que Vercel a les permissions nécessaires
3. Essayez de reconnecter GitHub dans Vercel Settings

### Problème 3 : Erreur d'authentification Git

**Solutions** :
1. Si vous utilisez HTTPS avec token, vérifiez que le token est valide
2. Si vous utilisez SSH, vérifiez que la clé SSH est ajoutée à GitHub
3. Testez la connexion :
   ```bash
   # Pour HTTPS
   git ls-remote origin
   
   # Pour SSH
   ssh -T git@github.com
   ```

### Problème 4 : Vercel ne peut pas cloner le repository

**Solutions** :
1. Vérifiez que le repository n'est pas archivé
2. Vérifiez que vous avez les droits d'administration sur le repository
3. Essayez de supprimer et réimporter le projet dans Vercel

---

## 🔒 Sécurité

### Bonnes Pratiques

1. **Ne jamais commiter les tokens dans Git**
   - Utilisez `.gitignore` pour exclure les fichiers contenant des tokens
   - Utilisez les variables d'environnement de Vercel

2. **Utiliser des tokens avec expiration**
   - Configurez une expiration pour vos tokens GitHub
   - Régénérez-les régulièrement

3. **Limiter les permissions des tokens**
   - Donnez seulement les permissions nécessaires
   - Pour Vercel, `repo` est suffisant

4. **Utiliser SSH plutôt que HTTPS avec token**
   - Plus sécurisé pour l'accès long terme
   - Les clés SSH peuvent être révoquées facilement

---

## 📋 Checklist

### Avant de connecter

- [ ] Repository GitHub créé (privé)
- [ ] Code poussé vers GitHub
- [ ] Compte Vercel créé
- [ ] Compte GitHub lié à Vercel

### Configuration Vercel

- [ ] Repository importé dans Vercel
- [ ] Variables d'environnement configurées
- [ ] Premier déploiement réussi
- [ ] Déploiements automatiques activés

### Vérification

- [ ] Application accessible via l'URL Vercel
- [ ] Firebase fonctionne en production
- [ ] Test de déploiement automatique réussi

---

## 🎯 Résumé Rapide

1. **Créer un Personal Access Token GitHub** (si nécessaire)
2. **Connecter Vercel à GitHub** via l'interface web
3. **Importer le repository privé** dans Vercel
4. **Configurer les variables d'environnement**
5. **Déployer** → Vercel déploie automatiquement à chaque push !

---

## 🔗 Liens Utiles

- **Vercel Dashboard** : https://vercel.com/dashboard
- **GitHub Settings** : https://github.com/settings/profile
- **GitHub Personal Access Tokens** : https://github.com/settings/tokens
- **Vercel Documentation** : https://vercel.com/docs
- **GitHub OAuth Apps** : https://github.com/settings/applications

---

**✅ Une fois configuré, chaque `git push` déclenchera automatiquement un déploiement sur Vercel !**

